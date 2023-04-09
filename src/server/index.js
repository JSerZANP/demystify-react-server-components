import bodyParser from "body-parser";
import express from "express";
import path from "path";
import serialize from "../framework/serialize";
import getPosts from "./posts";

const app = express();
const port = 3000;

app.use(bodyParser.json());

// serve static files under public/
app.use("/static", express.static(path.join(__dirname, "../../public")));

// API exposed for client-side use
app.get("/api/posts", async (req, res) => {
  const list = await getPosts();
  res.json(list);
});

app.post("/render", async (req, res) => {
  const { component, props } = req.body;
  const Component = require(path.join(
    __dirname,
    "../components/" + component + ".server.js"
  )).default;

  // assume all server components are async for now
  const json = await Component(props);
  const str = serialize(json);
  res.send(str);
});

// serve built index.html
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/index.html"));
});

app.listen(port, () => {
  console.log(`App is live at http://localhost:${port}`);
});
