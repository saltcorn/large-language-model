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

for (const nameconfig of require("./configs")) {
  const { name, ...config } = nameconfig;
  describe("llm_generate function with " + name, () => {
    beforeAll(async () => {
      getState().registerPlugin(
        "@saltcorn/large-language-model",
        require(".."),
        config,
      );
    });
    it("generates text", async () => {
      const answer = await getState().functions.llm_generate.run(
        "What is the Capital of France?",
      );
      //console.log({ answer });

      expect(typeof answer).toBe("string");
      expect(answer).toContain("Paris");
    });
    it("generates text with system prompt", async () => {
      const answer = await getState().functions.llm_generate.run(
        "What is the name of the last week day in a normal work week?",
        {
          systemPrompt: "Answer in German, even when questions are in English",
        },
      );
      //console.log({ answer });

      expect(typeof answer).toBe("string");
      expect(answer).toContain("Freitag");
    });
    it("generates text with chat history", async () => {
      const answer = await getState().functions.llm_generate.run(
        "What is the name of the river running through this city?",
        {
          chat: [
            {
              role: "user",
              content: "What is the capital of France?",
            },
            {
              role: "assistant",
              content: "Paris.",
            },
          ],
        },
      );
      //console.log({ answer });

      expect(typeof answer).toBe("string");
      expect(answer).toContain("Seine");
    });
  });
}
