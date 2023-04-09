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
  const bundle = await rollup({
    input: [dir_built + "/Root.js"],
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
          <h1>Issues of client-side rendering - Ep1 of <a href="https://github.com/JSerZANP/demystify-react-server-components">Demystify React Server Components</a></h1>
          <div>Below is a  React app that:<br>
          <ol>
          <li>has all components bundled in one</li>
          <li>fetchs data through API and does client-side rendering</li>
          <li>parses markdown on client by <a href="https://www.npmjs.com/package/marked">marked</a></li>
          <li>shows loading indicator by Suspense</li>
          </ol>
          This approach sounds pretty standard, it should be fine. But still there are some issues :<br/>
          <ol>
          <li>components are all bundled together, even when not rendered on initial load</li>
          <li>the dependency of markdown parser is too much</li>
          <li>the API exposing is tedious</li>
          </ol>
          How can we improve ?
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

  // build the static resources
  await buildForClient();
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
