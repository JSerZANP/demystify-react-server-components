import bodyParser from "body-parser";
import express from "express";
import path from "path";
import renderServerComponentToStream from "../framework/renderServerComponent";

const app = express();
const port = 3000;

app.use(bodyParser.json());

// serve static files under public/
app.use("/static", express.static(path.join(__dirname, "../../public")));

app.post("/render", async (req, res) => {
  const { component, props } = req.body;
  const Component = require(path.join(
    __dirname,
    "../components/" + component + ".js"
  )).default;

  const json = await Component(props);
  renderServerComponentToStream(json, res);
});

// serve built index.html
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/index.html"));
});

app.listen(port, () => {
  console.log(`App is live at http://localhost:${port}`);
});
