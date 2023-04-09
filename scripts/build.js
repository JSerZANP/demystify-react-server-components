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
          <h1>Manually split component into client part & server part - Ep2 of <a href="https://github.com/JSerZANP/demystify-react-server-components">Demystify React Server Components</a></h1>
          <div>To address the issues from <a href="https://github.com/JSerZANP/demystify-react-server-components/pull/1">Ep1</a>, we'll do following:<br>
          <ol>
          <li>manually split PostDetail into PostDetail.client & PostDetail.server</li>
          <li>PostDetail.client just pass down the props and query response from /render</li>
          <li>/render will render PostDeail.server into JSON and send it back</li>
          <li>PostDetail.client renders the response</li>
          </ol>

          By above step, we have a rough Server Component working for us(We do the same for PostDetail as well), we managed to 
          <ol>
          <li>move markdown related dependencies to server</li>
          <li>remove data API endpoints</li>
          </ol>
          
          <p>Sounds good! But it doesn't support nested components though, we cannot do the same to PostList, we'll try to fix this in next episode.</p>

          <p>Below is the improved app, open Network tab from Chrome Dev Console to see the requests</p>

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
