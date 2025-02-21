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

const { PASSPHRASE = "123456", PORT = "3000" } = process.env;
const APP_SECRET = "6f24609f5430d64f8162e96428b7c03f"
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDlH+vj8Q/VDk98
MYRGLPKF18y6P57B9jmqjjFJqXVPPvwun2SFFmPL+Y4el33ye377mDkxrZK0S5jp
AZnUJe08qNsJ7zhcXr1T2lPxS2gUSrirtTBQp4hr+5NJNqnKnSPuBWbYWr5Brn1u
Mk7gh+gTclrQoCeZdX77VW8wfjNPtMwk2myYaqPhBc4GJpme7jIMTmGZUDvzgOgC
KOhs7VDmzajHFRDXz6PB6u/8LYEHgLWbjA7YiHPLewyaXh+sDYumuJJgbigZMyac
FwI2+MiXSdekzdeNd7W0b5Q41aJdg18vNjNHyMSnvT42d8546mHYaXV5LbyqXLic
Bl2m4zLrAgMBAAECggEAYXPOzpAQ5lMkXpPnCTwD2QacxpjZqvDRvSemcgi34wFM
nH3h8LNBtheKKZvQj2qUa2lm5ijHzZSb0HsEVRXejh7ZryOGys7m4vvpGSez+HGB
k1LI3n0rSpZholG0LP/iMNIuWJZb9q7DHbQbFWfovyCz3KlJvn0ZicfgN3Vt2Jek
4xEsMwP6wssEOYLBR/jJKSUZ+MwwIf1z00Wt3QUHFyvhtEYIMDVUpDl5kJHxN/gv
qIAzSKTHKqjBXLt/zYbGanDaIcUWToxHPyrG+b9gTdhJ+0V/e+A+4XI9zF+2cJ/u
WdG+wl8Bg83frQSHe8hBJZCkfXi0TVH5Nnr88qyxGQKBgQD5RLBbSgEOjl0bKDc4
RZjVO+2kgDXNVeDEicTpONxwRma9MzJZMu1dSB1O11IMuQYTyRNgNXDhsfpAC7iV
akkaFMAhTuWOdwwTNic9OX6wkEWYZabG21jrQYvBkyn9M6UMSrJAyGcJb6IjTp7y
Q4oTwLrG6jhzPa/BwmONeAYbOQKBgQDrT/hVbCYOJAnQodEQ03K7Wa+POF+VdTlo
ZPBWMCGu5doTQX0vCxe6SSnhW7VwYsNH+SDVmzdZYl/cQLizw4vJtjxX0zj7r3R1
J0YX6Gj/UNY+8plwz/PUh/T7Hr0elkTFk2fmBk1BsFI2yOUjo5K1JefeyYqOieRf
BAcP4vOrQwKBgDtOvYsq4298LejtO5426PMrLBKssqBlY3I/uUsoTUKlbYJssPkK
JfHA28BLeOkwCKMif2qvrGj2uK0OXN+oBzaeY0xJglLQPl4/zzxA9sS5vuVQokrE
G7b1xHPNOPtWk1mGWD0TsXhMSE6QQT8xFKQ4gfgb+ExrC+tU/ezF9uX5AoGATYXo
I4RguTHoReK5tNhkqRJwAzgoTV30Ts9KWqq6vhsdkFB4BIKcC5RFBuimyuLOwSxz
Q8xCHOGLAU4VS6v1prux/6En2ctBC8OnlQLNbKfeHZjhMkhgZTlxXTYQSj5pY8of
ZanX0/dZ7pCa5PXjxGg7jqtJSZJmOWNjTDmR228CgYAJXRkj/BP21wB4ZldDIhWo
i/onMtT2jnY/JUqkp82GLvLDyTpBytwuyRa9UY70jJV+YS69JYB69TRGIaclyHVN
2ArfKhEFl1VVc5t4wXq9S8+JBeg5uOtxIzqH5P+8bJFdCSrpwFP6Y7rEeFGgY9Sa
SPdH32tPcCZx7ZSUO0LoBQ==
-----END PRIVATE KEY-----`

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
