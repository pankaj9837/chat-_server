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
MIIFJDBWBgkqhkiG9w0BBQ0wSTAxBgkqhkiG9w0BBQwwJAQQFWCK+G5bU2HGpGcJ
uzc5wwICCAAwDAYIKoZIhvcNAgkFADAUBggqhkiG9w0DBwQIHkJEIbnXwGcEggTI
jYLYRc0KtxjQvj//qgBacV9qeCMbpuUO3nXEwZiNXXye+nzCsB8L79B6+XdVJ87G
LYz6Z+O0r4yEHdTd5WJYLyXp65eAAnJ2G7sxRnxWcI+Cnx8NL+UlongWbSi17lmE
Urkg5C9sugr5B4gOa44RIIfO4aexwYfO1ZR13rksRaTuwCJmRS/Ts3vDlcbhxgbg
yitsTnEvik2gAES8pbn0CGOFGMw+7wqSgXg9SktDCsksVEl8XoYbiXCZQBysqYEe
91tj3E4KQKNHjTvUkBgUJTvK4vVRQflvIiHxCMNh79XU6T2NveWVNroEVsbQDCLY
W4masYSIa6FwUy3Dx9elBwGBCb7ETWtlwAcwKsenSxQI8kcujKhL+PS6Tx1Rwp9S
juvY2KSLJ8o06SJ3Pr7zTjlCzYZs/y2NEAKDmmOuWzWDHh43GR34+YNZ3PVYwhV3
UDHN8lQxVSLPBTEmsWOMPYuk9RJSautfygLoGch8eUo+b2woQ+Lj2Ol2We54HEI2
e4g7SjHDOKhihg67mhXrWWm/ZOwsC1vY2BLqlT7qv1Oy1+f8P9XKe2yhYbuashIJ
GwW2Xb9xU51A6YadiFWmFgx0eGcmAyLBwphnILOBPKwOQWRogULs2Kkv1UhHHo7e
ERH8wP575BEvQPnCmNcggGWVyvncPSU1hCGqLhPwg/aMFj6AHJG+5X8NHCOW60YV
pyEbMNkcapVFp3O7MwYRTipuA8cvQRNbvqmVgihteaQMuzZbfDVV50mpnClUICSs
ZmF6LEQQe4QvLEvpiKBSxJuHwuT8eJloxhO5Bw14EqvJOlfgZtFC41pG/dJD/fYL
vIuciL2dHFmY9VcLZpIWUL0IfHNkfk/a2xIAxe658yBM+TZoxTa71gd1EitcP0Pm
s7uNX0ll5FLj10J6sq6sXbDXbXRTCILbno0ixaV7Mb/nfwNR2k7AVEzve7sEKrRb
rLqIZrQeACeTo+wdmIs5nVkIT0TVNqxMuB3GKJuUU6mB2i5/keLz7bpWOG0pZh2T
wblXLGjBLqO3KqF1RoT5yTi67N8oOgjlIB+gzmY0MjctMpOUCLZtLZjpM5Wprlqa
2VKlc87/G9WhltcVSmtuDbZT+xx3CYqIxnvMGz+mv9LnWEggzZogDOEzwAelkxcD
CBgdHKppmbRlpqJs9lpIK/VpeSWqzRHNZJ8GVvMAkSkCs+FbAeSjGXRAdUtVWLmv
6dvNeWhyqnE9IL4Q+e23tKZgKDFHIAUIrJNei/3xnJvnmMEIAq9/4uiDNHLtlny3
0PTnKxcltDgUW8ubIrzJ9IAVrm33uuzcRKan7S4+Loe7KkUGFPG+MgkpBnf1mIFj
B2eeKhcC4gS6ghKMUv/4Z8alx2J+5l9PEN+brnKf5IaVRpG4NM3nWtKiX1mICIJB
69oKcTzPesO2rfTiaIWVUtIQqcDueTv95auLmH/SmuHybLdXvcphJDtdlC/RoELT
wpYuxVFOTg4KNfJ3sdL2UgqikS8jvn8wHXAMW2HGX1pKVZwPI8sJDjVWDXsGM6oJ
EnqiwlumMhCn1qKmeONOQio0+FpLIwexEzAJ4CipUH8dIGd6+heM9gTbqM6j7uPJ
5IeeZSN0Vjg1PXW2kklroVuGDFCjaBYf
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
