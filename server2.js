/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import express from "express";
import { decryptRequest, encryptResponse, FlowEndpointException } from "./encryption.js";
import { getNextScreen } from "./flow.js";
import crypto from "crypto";

const app = express();

app.use(
  express.json({
    // store the raw request body to use it for signature verification
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf?.toString(encoding || "utf8");
    },
  }),
);

const { PORT = "3000" } = process.env;
const PASSPHRASE = "password"
const APP_SECRET = "6f24609f5430d64f8162e96428b7c03f"
const PRIVATE_KEY = `-----BEGIN ENCRYPTED PRIVATE KEY-----
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
+XPIVUSzzV9tSgl/c49fT3qFXN5ru6jJ
-----END ENCRYPTED PRIVATE KEY-----`

/*
Example:
```-----[REPLACE THIS] BEGIN RSA PRIVATE KEY-----
MIIE...
...
...AQAB
-----[REPLACE THIS] END RSA PRIVATE KEY-----```
*/

app.post("/", async (req, res) => {
  if (!PRIVATE_KEY) {
    throw new Error(
      'Private key is empty. Please check your env variable "PRIVATE_KEY".'
    );
  }

  if(!isRequestSignatureValid(req)) {
    // Return status code 432 if request signature does not match.
    // To learn more about return error codes visit: https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes
    return res.status(432).send();
  }

  let decryptedRequest = null;
  try {
    decryptedRequest = decryptRequest(req.body, PRIVATE_KEY, PASSPHRASE);
  } catch (err) {
    console.error(err);
    if (err instanceof FlowEndpointException) {
      return res.status(err.statusCode).send();
    }
    return res.status(500).send();
  }

  const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;
  console.log("💬 Decrypted Request:", decryptedBody);

  // TODO: Uncomment this block and add your flow token validation logic.
  // If the flow token becomes invalid, return HTTP code 427 to disable the flow and show the message in `error_msg` to the user
  // Refer to the docs for details https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes

  /*
  if (!isValidFlowToken(decryptedBody.flow_token)) {
    const error_response = {
      error_msg: `The message is no longer available`,
    };
    return res
      .status(427)
      .send(
        encryptResponse(error_response, aesKeyBuffer, initialVectorBuffer)
      );
  }
  */

  const screenResponse = await getNextScreen(decryptedBody);
  console.log("👉 Response to Encrypt:", screenResponse);

  res.send(encryptResponse(screenResponse, aesKeyBuffer, initialVectorBuffer));
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});

function isRequestSignatureValid(req) {
  if(!APP_SECRET) {
    console.warn("App Secret is not set up. Please Add your app secret in /.env file to check for request validation");
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  const signatureBuffer = Buffer.from(signatureHeader.replace("sha256=", ""), "utf-8");

  const hmac = crypto.createHmac("sha256", APP_SECRET);
  const digestString = hmac.update(req.rawBody).digest('hex');
  const digestBuffer = Buffer.from(digestString, "utf-8");

  if ( !crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    console.error("Error: Request Signature did not match");
    return false;
  }
  return true;
}
