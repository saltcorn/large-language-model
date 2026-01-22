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
});

const activate_config = async (cfgname) => {
  const { name, ...config } = require("./configs").find(
    (cn) => cn.name === cfgname,
  );

  getState().registerPlugin(
    "@saltcorn/large-language-model",
    require(".."),
    config,
  );
};

describe("llm_generate function with OpenAI completions", () => {
  it("generates text", async () => {
    await activate_config("OpenAI completions");

    const answer = await getState().functions.llm_generate.run(
      "What is the Capital of France?",
    );
    console.log({ answer });

    expect(typeof answer).toBe("string");
    expect(answer).toContain("Paris");
  });
});
