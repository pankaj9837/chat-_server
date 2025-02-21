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
MIIC3DBWBgkqhkiG9w0BBQ0wSTAxBgkqhkiG9w0BBQwwJAQQ7lYczp3YbD0n6ysg
+MOougICCAAwDAYIKoZIhvcNAgkFADAUBggqhkiG9w0DBwQIiHSGqMdNY10EggKA
ZgFftOfgOGWwKJ0fhF0MLwFjpbuQCUoCRcxrxqcIHHXhQ4klrzdoMxBV0Nfw4yWG
/Tc2XwT7RRcGlxch9L0WXCrxrKZcE8uZE7DduDH7b/bqzaKraaTXWIXgyrVQf6/V
3EPme7+9gXCSsUSa+iW6+xIF/rNSEIQgaGmuu1gZ+uC7OMa6Vlmze9TS91Zayyy7
8RD0joXXuLyEJ1QtrYFamEdNr/utUhL6MIJ+yexWkPlBiMro6UnvV8SQBYDUBwRg
gOOeeZBK3HoylOyUazttqICyNRaLTInGpf0n19vkfqv//trVTQTVNzJvtwwnP3/+
gSI1z1xcOycIb3VziBWv89ka07B7YEJMs5LiNOEIrS2Arpeu/cTBJInGfl5CuVcR
db8uxPYNIA6DNzRzIumxXHmYzmHvutW82eAahhDz6YhmAoHxcCWhX55WBHfNq2Of
twmoDgebTktvFaga0wH0cjtekGXnUx+Sel/VC7WAzGDJGkxhgcpi1mn/2p+76edy
7rmWFcGpJd5Yari8ZbpGITlTKdHagMrm4Fi4kqjnLi0ezbB2G6VUNK/rVoHtujEK
aq3Y8ogEGZ+lOxKA3juXOkMjCwY0tx7zOCTx/gFPAlH750INgNjzLktFrsHM9DUQ
XWbQ0UEOeb+oQWY92XMuEALX94rRxVKtq+tT7ZXMx5kGFTLVqHmmYFGcATv0IWjp
oMNCofSzkqPrZzmIlFEBY05GEeb3qZVFk5vFrxUED/x0ZEDeM0LKd2IM41x95pzY
Vi7jkETszrjUCiYKXj4DfgOzqucIIpG2TJNRi9GST2jm/CnKRO1BzwI0eAJ4Dhcn
czwtbEx1sHCn17rP22w5nQ==
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
