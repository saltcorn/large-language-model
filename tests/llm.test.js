const { getState } = require("@saltcorn/data/db/state");
const View = require("@saltcorn/data/models/view");
const Table = require("@saltcorn/data/models/table");
const Plugin = require("@saltcorn/data/models/plugin");

const { mockReqRes } = require("@saltcorn/data/tests/mocks");
const { afterAll, beforeAll, describe, it, expect } = require("@jest/globals");

afterAll(require("@saltcorn/data/db").close);
beforeAll(async () => {
  await require("@saltcorn/data/db/reset_schema")();
  await require("@saltcorn/data/db/fixtures")();

  getState().registerPlugin("base", require("@saltcorn/data/base-plugin"));
  getState().registerPlugin("@saltcorn/large-language-model", require(".."));
});

for (const name_config of require("./configs")) {
  const { name, ...config } = name_config;
  const plugin = await Plugin.findOne({
    name: "@saltcorn/large-language-model",
  });
  plugin.configuration = config;
  await plugin.upsert();
  getState().registerPlugin(
    "@saltcorn/large-language-model",
    require(".."),
    config,
  );
  describe("llm_generate function with " + name, () => {
    it("run count_books", async () => {
      const answer = await getState().functions.llm_generate.run(
        "What is the Capital of France?",
      );
      console.log({ answer });

      expect(typeof answer).toBe("string");
      expect(answer).toContain("Paris");
    });
  });
}
