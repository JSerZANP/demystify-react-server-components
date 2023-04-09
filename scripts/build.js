const babel = require("@babel/core");
const { rollup } = require("rollup");
const { nodeResolve } = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const replace = require("rollup-plugin-replace");
const html = require("@rollup/plugin-html");
const fs = require("fs");
const path = require("path");

const dir_src = path.resolve(__dirname + "/../src/");
const dir_built = path.resolve(__dirname + "/../built/");
const dir_public = path.resolve(__dirname + "/../public/");
const dir_components_src = path.resolve(__dirname + "/../src/components/");
const dir_components_built = path.resolve(__dirname + "/../built/components/");

/**
 * transpile the files, handling JSX
 * src/ -> built/
 */
function transpile() {
  const files = getFilesRecursive(dir_src).filter((file) => /jsx?$/.test(file));
  for (const file of files) {
    const content = fs.readFileSync(file, {
      encoding: "utf-8",
    });

    const { code } = babel.transformSync(content);
    const dest_file = file
      .replace(dir_src, dir_built)
      .replace(/\.jsx?$/, ".js");
    writeFileSync(dest_file, code);
  }
}

/**
 * bundle the app with rollup
 * built/ -> public/
 */
async function buildForClient() {
  const { serverComponents, clientComponents } = await readAllComponents();
  // for server component A.js, we create a client side version A.js
  // using the same name to bundle
  for (const file of serverComponents) {
    const componentName = file.fileName.split(".")[0];

    const clientCode = `
     import React from 'react';
     import ClientBase from '../framework/ClientBase';
     
     export default function ${componentName}(props) {
       return <ClientBase component="${componentName}" {...props}/>
     }
     `;

    writeFileSync(
      dir_components_built + "/" + componentName + ".js",
      babel.transformSync(clientCode).code
    );
  }

  const bundle = await rollup({
    input: [
      dir_built + "/Root.js",
      dir_built + "/framework/LazyContainer.js",
      dir_built + "/framework/Link.js",
      ...[...serverComponents, ...clientComponents].map(
        (component) =>
          dir_built + "/components/" + component.fileName.split(".")[0] + ".js"
      ),
    ],
    plugins: [
      replace({ "process.env.NODE_ENV": JSON.stringify("production") }),
      commonjs(),
      nodeResolve(),
      html({
        publicPath: "/static/",
        title: "Demystify React Server Components 1",
        template: ({ attributes, files, meta, publicPath, title }) => {
          const scripts = (files.js || [])
            // only load the verndor and entrypoint
            .filter((file) => /react|Root/.test(file.fileName))
            .map(({ fileName }) => {
              const attrs = makeHtmlAttributes(attributes.script);
              return `<script src="${publicPath}${fileName}"${attrs}></script>`;
            })
            .join("\n");

          const links = (files.css || [])
            .map(({ fileName }) => {
              const attrs = makeHtmlAttributes(attributes.link);
              return `<link href="${publicPath}${fileName}" rel="stylesheet"${attrs}>`;
            })
            .join("\n");

          const metas = meta
            .map((input) => {
              const attrs = makeHtmlAttributes(input);
              return `<meta${attrs}>`;
            })
            .join("\n");

          return `
        <!doctype html>
        <html${makeHtmlAttributes(attributes.html)}>
          <head>
          <style>
          * {
            font-family: sans-serif;
          }
          #root {
            padding: 1rem;
            background-color: #eee;
            margin-top: 1rem;
          }
          </style>
            ${metas}
            <title>${title}</title>
            ${links}
          </head>
          <body>
          <div class="desc">
          <h1>Render Client Components in Server Components - Ep3 of <a href="https://github.com/JSerZANP/demystify-react-server-components">Demystify React Server Components</a></h1>
          <div>We couldn't move PostList to server as we did in ep2 because it renders <Link/> and <Link/> needs DOM api which means it must be a Client Component.<br>
          In this episode, we do following to address this issue

          <ol>
          <li>when rendering Server Component, we replace Client Components with "LazyContainer"  </li>
          <li>"LazyContainer" will be replaced with working client component -LazyContainer on client</li>
          <li>LazyContainer lazy loads the actual component (Link in our case) and renders</li>
          </ol>

          With this we are able to move PostList to a Server Component, Hooray! Check the app below to see the lazily loaded js resources.
          
          <p>But it is even more tedious now, how can we make it less painful?</p>
          </div>
          <div id="root"></div>
            ${scripts}
          </body>
        </html>`;
        },
      }),
      {
        name: "",
      },
    ],
  });

  await bundle.write({
    format: "es",
    manualChunks: {
      react: ["react"],
      "react-dom": ["react-dom"],
    },
    dir: __dirname + "/../public",
  });
}

function removeBuiltFiles() {
  deleteFilesRecursive(dir_built);
  deleteFilesRecursive(dir_public);
}

async function start() {
  // build with a fresh start
  removeBuiltFiles();

  // first transpile JSX syntax
  transpile();

  // for a component, it could be server component or client component (default server component)
  // but for server component, it also has a client version of it so that it could be uesd on client
  await buildForClient();

  // for server build, just transpile it again as a quick fix
  transpile();

  // genreate a component map so that on server we can easily tell if a component is client component
  await generateComponentMap();
}

start();

// below are utils

function deleteFilesRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
      const filePath = path.join(dirPath, file);

      if (fs.statSync(filePath).isDirectory()) {
        deleteFilesRecursive(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

function writeFileSync(filePath, content, charset = "utf-8") {
  const dirname = path.dirname(filePath);

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }

  fs.writeFileSync(filePath, content, { encoding: charset });
}

function getFilesRecursive(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFilesRecursive(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function makeHtmlAttributes(attributes) {
  if (!attributes) {
    return "";
  }

  const keys = Object.keys(attributes);
  // eslint-disable-next-line no-param-reassign
  return keys.reduce(
    (result, key) => (result += ` ${key}="${attributes[key]}"`),
    ""
  );
}

async function readAllComponents() {
  const allComponents = await new Promise((resolve, reject) => {
    fs.readdir(dir_components_src, (err, files) => {
      if (err == null) {
        resolve(files);
      } else {
        reject(err);
      }
    });
  });
  const serverComponents = [];
  const clientComponents = [];
  allComponents.forEach((file) => {
    const content = fs.readFileSync(dir_components_src + "/" + file, {
      encoding: "utf-8",
    });
    if (!content.includes("use client")) {
      serverComponents.push({
        fileName: file,
        content,
      });
    } else {
      clientComponents.push({
        fileName: file,
        content,
      });
    }
  });

  return {
    serverComponents,
    clientComponents,
  };
}

async function generateComponentMap() {
  const { serverComponents, clientComponents } = await readAllComponents();

  // TODO: the client components from framework should be built
  writeFileSync(
    dir_built + "/utils/componentMap.js",
    `
module.exports =  {
  serverComponents: [${serverComponents
    .map((file) => `"${file.fileName.split(".")[0]}"`)
    .join(",")}],
  clientComponents: [${clientComponents
    .map((file) => `"${file.fileName.split(".")[0]}"`)
    .join(",")},  "Link", "LazyContainer"],
}
    `
  );
}
