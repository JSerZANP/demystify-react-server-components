import fs from "fs";

const dir = __dirname + "/../../posts/";

/**
 * get post data from md files.
 */
export default async function getPosts() {
  await wait(2000);
  const files = await readFiles();
  const result = [];
  for (const file of files) {
    const content = fs.readFileSync(dir + file, {
      encoding: "utf-8",
    });

    const title = extractTitle(content);
    result.push({
      permalink: file.split(".")[0],
      title: extractTitle(content),
      content: "# " + title + stripMeta(content),
    });
  }
  return result;
}

function extractTitle(content) {
  const match = content.match(/\ntitle: "(.+)"\n/);
  return match?.[1];
}

function stripMeta(content) {
  return content.replace(/---[\s\S]+---/, "");
}

function wait(delay = 1000) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

function readFiles() {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err == null) {
        resolve(files.filter((file) => /\.md$/.test(file)));
      } else {
        reject(err);
      }
    });
  });
}
