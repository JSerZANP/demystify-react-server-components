import express from "express";
import path from "path";
import getPosts from "./posts";

const app = express();
const port = 3000;

// serve static files under public/
app.use("/static", express.static(path.join(__dirname, "../../public")));

// API exposed for client-side use
app.get("/api/posts", async (req, res) => {
  const list = await getPosts();
  res.json(list);
});
app.get("/api/post/:permalink", async (req, res) => {
  const list = await getPosts();
  res.json(list.filter((post) => post.permalink === req.params.permalink)[0]);
});

// serve built index.html
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/index.html"));
});

app.listen(port, () => {
  console.log(`App is live at http://localhost:${port}`);
});
