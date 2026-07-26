import assert from "node:assert/strict";
import test from "node:test";

import { errorCodeForHttpStatus } from "./api.js";

test("HTTP status fallback keeps upstream outages separate from invalid model output", () => {
  assert.equal(errorCodeForHttpStatus(502), "MODEL_SERVICE_UNAVAILABLE");
  assert.equal(errorCodeForHttpStatus(503), "MODEL_SERVICE_UNAVAILABLE");
  assert.equal(errorCodeForHttpStatus(504), "MODEL_TIMEOUT");
  assert.equal(errorCodeForHttpStatus(500), "HTTP_ERROR");
  assert.equal(errorCodeForHttpStatus(400), "HTTP_ERROR");
});
