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
MIIFJDBWBgkqhkiG9w0BBQ0wSTAxBgkqhkiG9w0BBQwwJAQQEoVtrt+cikIq2wZL
kP5NPwICCAAwDAYIKoZIhvcNAgkFADAUBggqhkiG9w0DBwQIheDvHfRxewUEggTI
GFZfgWjVxyG0Itm2MIxlgstHLZbw05hFy3pI71R/CLDwOp5OTCy30oDpHKoJUXkQ
3MF/aTxxpWOV8ZfsAeZEbAK1xL+/rPLC8Q5PMAbE37I8dhAyqdrgnNw7GFfAGRcX
+0lQFCCfPF3YJCO8wsPHv+GvQMocJL9B1dW4R3sYweVTF59tlmbHN0jQ0f70HY1/
kf8fXaRx1pJ9lh0Dm9AE2IC2c4b3M0bkSwqdUgYgWZE5t/h/DTZ4UBY/1kGjVK3N
B2vp/x4JN9SWf7s7Ve4AXC+W5c+8vqhp31N2C4IcP15W6Dy0YvArO+jKFjHMSX4S
vKU+GxPd6QPYfRyzVuuLcDLJ42O8vrAry3plO16FU0W1l+jMF5U9vW4lT8wvbtii
/dWJobSM9I8s0ZMOOZ2rTTGt6qKpc1X8ufGxh2r/c0dETFI8786wtIKjZBR4YlDF
wiqpRitJxKnQQjxfjTqHjRKNREU5rG2FG/qYM9HqvrmblKNvb6wGOIGMMych0gGQ
+Y+HOWfbNCZ1EGGTbmMH0I9YQ2Ymxkzde0tfv5FKVFQf2twGD67d9BIiETNaGyjD
GmClZBaqA+rLnO2EkKWOYa+mDBpobTZtTiY1kys70nM4fIPLt9XldKk1Zq5UWiVC
IdwKTQekey+CqQvNuzIGIWrQ/cOKiaOXj8igIwekm9Vr93NCjJDa8hv4cMlFLbQr
3kn26/w31D9Cs8u1ddlRhvbt9lYcNMaJS+esOa6UMOSV/2Bk35bwu9tOFJzuNJ33
9rTIK1iM238oIdGgi0zYJqwK3NpUUGuq6b/4oo8i4wvVkXbroddKoqKIFMhuZ5Sj
9Ml5tF+awmB1JiMYO8thZ4z/bVhtdz4AfoLJ0cBFTu4DbRAYo7uQpubjuj106CK4
g0nBh1eFKX6QpWHvFbbVrc8ez6gR4kCRkYUTRrH2wHrHQEya48jc2af+cdcPdi/B
DNZ4JEf0Pswm720MUDdE5gHMnmoDOvSAdduCPQ9Y45SB5tot4w92ZG4nLMOjIu++
fIGDZOeBWv/QWv/pUgvVvOI5CVTLQIqmmyjFMWrHH4P9x1yO3eg30d47qH64JDko
TVnk/IYz91HVkAxGdl3ctDrb4ZXywwF4FyiJ6MeVbWQrq1l4AWzQvoAPY7DHSDv2
/toC081n6UUhOrndzfjRKBxvs6N/xXGnvObCHy8UaVVDGk46d7jw0cYMaTSBHf8B
AQ/YyItG1K3xaBiHNGHSoaivcIO/YMfIUes4+Q1xRT0Zv6ygDV271jVtyfccuJpt
e+uRtHr04fbUy0Hy3hGFj15cTw2ofeAVnIvV9NDV2ozgq4gk/0lDhU50kmzemfoO
AAD1+4+GxZvj58BeoJTDU1iEjrTdlDeXioLr+uZcVR7SpceBWCA0CvuPW+zvvld2
K74epJO5FnSG+p038lz4DPKCxVyJj9SUOx8TtV6FXrOaGOlzMVZGgQmfx+5r0iUx
/g2TdnkW8HkA8I9Ws+rUC6BMeqAMT1t4TNWk+6f4+Si2Hn5U+xwjLqkcCbfoCmBp
87UT6607gNIltZAGh0OmF4aSrHbD04yDN/LBRaBaheQ4biPv0ZoD7Atc+d/kbC31
Kpje05SDbB0sr9cK/0+3UtxFLsoZ3fKE
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
