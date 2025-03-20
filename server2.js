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
const APP_SECRET = "33c7ec9aa719ba8350b67811bf64e47b"
const PRIVATE_KEY = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFJDBWBgkqhkiG9w0BBQ0wSTAxBgkqhkiG9w0BBQwwJAQQfQIRPQ5SjaQ4p05x
WvGvzQICCAAwDAYIKoZIhvcNAgkFADAUBggqhkiG9w0DBwQISLBouIKHRwUEggTI
UQvtJjKzuiXyRiYNcqFkxO5I2jyxqAwKQMdwGz6iY3RSbqlQpdZdvzbEt4FUPtf4
D+s3OFuQjYzb1fqGmg2eh4Qk7/6Uu16GzOBMN9E9dpP0Y+38F+QBCDDYsAR4AANU
uAIdAiI5CdOQCKa1SB9evVrgjPF1lZiBHIznlfXVpvs+lF+4cEmauYuOJR0hkjh8
EqFN3/tzrAbrXOjVr18MdsFWlrjhIO1G6JzUE1Cgek/hWPHkegWRJZUexEbf1JQG
yHksk5/EDKSImT95IpwkVAtVgEAE38RaOknSsscabf4M2XZqnKX0vQvF9ZPqu5Hs
OigWU9Zpwlolh6J/4W3TX/PiPY6KXNsXaXnQSTrDLKPLTzp5rafDQFRtNlSJXR3F
8/0rDWhD+zfmf6siPS3M9DlhGusvYRmgWLVg0ThC1IdM3zGf9gVsrHWyZQmoLAZM
9RV14Xiho2WWzE+yySJ5ZLePhi9Ohwr79wG/Yzo4Wae2vpFJBKyMeDAsW7K2obkF
CGRIZF5t/2Jn1/ah/fE1kACYTYZzBEdCN12jKNgRmFlYb8ymfUfcbuOEhF4r4MRt
2Aporeg4BPAisWBvIhxn/NtnG9JVL2yaGeB0hB1nHZ2dcxt8iuSsy+Hkgh4u5jE0
D5VIldPkodN7yoZ6l+IUUPZXWtzkOFD3zeOovXfGz+GOtaLSgjEqfD/MKpIgUt/p
QOqJQ314Q/1ByYzF6zq5K5I9PFF2EXof1kDd//GLXy+QGdi7rsxlmPRxpo2ffvB9
pTBpXsFMzZjSMyRMpVEZXQHJ6OXj6W59e8fjSSRezqYhSa7pfpBp2Gbw956OnJ27
aR4yah+GykF3JpYlxHEIVL+L+tqaX31bllaUWRbQGnKy1N27e5Feg5Mtg3RlWcQ8
5gwgZpcWqZd4CWf7teHxAfF2c2l4QlGOvQ8uTP3WzfUTz6xd3G5ZHWiGU6YcpkOX
gSSc/NlmTBuPipI1w29mI4aN4QAqxPrax9uXfLZs+vpyz+GaJxG44uCYdNJ6owvz
yOWclsOocioYStqCLLr5znSSG+k2sDDAr9bG9D9TQKmJ/uSXP3uVXTOtWKBk9T44
JLm5RDbNzoIN3DTyGFnkGwmhB4Hv8pNHrXrHWUeNdW205gaMdlE5T8+b7xjeyarf
g7CK6F/okTDWOP7UDA5wVzFQKA2yg1wrJj8/0fDYD5/0PxixuGPKXOsNhBdBjtMU
ho/Vt9kjNBdUADnR8h+U6PUiJCjty5YzmRVEZfBhaUP4o1zDfQQ+PJ3gddoluxog
L4l+KsDUryopuMrj51Igg9XXWmoqf02G1aJIremVwVe/yL4JJzGdJe9OYqjQu3ci
dc6T9JJERBh32AsN2D9EwXdcGiFtQV+BSnietqL+hO1Bi5fWfoImEuJlMDYVm6um
NW54u9dy8QnnYxqBmPD9ulhru/MxK/2dhoXdRs7N763k11oNG5bJLSUkz9ZkyKhc
9wwbVan/3nVT6nuctiMv2Ty4/zpD/GxLf+1Lqk4XQMekim0vg60UavsKQHS8+dhF
8aSlbkWrinl7sKNP9BGIUNmIYPYGkjq7WuuMJsQzed36DHmxNkecCkk3Zg5JQYk7
CjUq+wH2ZqIfIJ1gSn9nUsZaoK/1Ij5a
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
if (!APP_SECRET) {
    console.warn("App Secret is not set. Please add it in the .env file.");
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  if (!signatureHeader) {
    console.error("Missing x-hub-signature-256 header");
    return false;
  }

  const signatureBuffer = Buffer.from(signatureHeader.replace("sha256=", ""), "hex");

  if (!req.rawBody) {
    console.error("Error: req.rawBody is undefined. Ensure middleware is set up correctly.");
    return false;
  }

  const hmac = crypto.createHmac("sha256", APP_SECRET);
  const digestString = hmac.update(req.rawBody).digest("hex");
  const digestBuffer = Buffer.from(digestString, "hex");

  if (!crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    console.error("Error: Request Signature did not match");
    return false;
  }

  return true;
}
