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
const PASSPHRASE = "123456"
const APP_SECRET = "6f24609f5430d64f8162e96428b7c03f"
const PRIVATE_KEY = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFJDBWBgkqhkiG9w0BBQ0wSTAxBgkqhkiG9w0BBQwwJAQQPZqZuyIov4IdvOhS
WYGyrgICCAAwDAYIKoZIhvcNAgkFADAUBggqhkiG9w0DBwQIs/yMbhZ5J0oEggTI
Ys+xiicnnesUH8/r5sgq/sqE3lPY4gXenCywGVo1VZs/m9TvzOu79ua2qCKfebN3
ymBGO0K45KXwZmemAJcL8103eSKz/8yl/ujzaUm6aijFvAz6kOa50rAIdI/o2z9C
VutgFhPR2wY5RvmdOhpcrB56s6xJC41JQt18UdaY/aiXgo1UqSTVbpaPqfUiRtKk
+II+ynMHx1+wdLp5ZnMHKlDp5TBPCAIAfHJffhhnpibup7Sq6BCgJtW7xojMmic4
kaXAlA4/d4cnNzFT5rpEUhETf8jP5WqnD+7I3S2gRHuFRbN6QHaqSMDvvfFZE/FD
nb0fYjmu4dvanUM06LxCLk981FjOxcqX0UKKFusBC2b0r13GHSphZahwgskTQNy3
ZcxFdME4ekJcJAgpmy4yJWQhQbFOZwroaVyDtFLFrsQMpvfL3w40TFvSNGAnwar2
9+im2uPl2Ydl6A0TUOaZa+uoIafwn3GbzEK5SvV2PYE0wFKtJLazCicB734z5s/M
Egc1NoRI9PM3KES9dNeQlTcFk++0SDYLtM1/SnzWxlLO2MY7mz0qnUau3AMnL2z4
fR79yoeMCoE1nNu9whCN/qDn/ASiq8qinO5nda0VnOYGbpTWyEXNXK+ZcuQA+BgE
bcJ2Urllfba+wlqOeo3gBSWQ1GNdzD/yZDzy7dyTIYO88mpMin5aGbe7wjh5TTPg
NpMHXiHwlaPgvrfRtRK/GeogOF0MkRx+nkkRVSjhMkULFFMKVAxWNrcBZED39CNT
Vh4GBJo9a2BYi1NgDBW6QaY0Y8L+ZaIFkhjBdnQaK3ODtTd0SZ3fRP9ipGWfPAKV
8rd1kg8UnpPjXIRYInYuy5ASIPtLmBFzKAQYw/9OM/pLG40J+a+Kne+GRA365JBW
/RG72TtPSr7zYMRFJrbx27T7i+GuHm8I34e9+UgfTEV/VZIDXbcPj79r5a4WDzcO
WKw1Cqp3bfdk+UvNLpr7uP4sQrwt8OD4LIfnFi5/V1g6VDqYw5pUzHOFJoitbf6+
6sq6u/oiwjzj3rTTJDYOemHCPo/1xssBZ2WpYh0xeLcvtnes35lmupXZU2gpEL6s
QpbYAeOIKu84opjmIjvqFlET0SMgB/G+C+SF3JLQ5CP+hAgC/N6104R+qhtafcFb
BAgRK715/uYFCxa0ZtFi8kiPc7Nn36aKgN1bzLZed2VSFnp+AurBkmKkhmKSKAx6
mvLfxcbHQ2zBvQSDidnuln9evT9vcLpZoLH1EvUfFlErMZmmBaKQpFLZpV41+lCM
Ubb+mlmCyd5g6GZ5VzDXFW/GpoK6d+u4Ko13Nd2PRZxp8o03tBEMID7ewA86OGR9
3Chjb6oBCVvV9zNwT5uNh4JTIxiCdm1ypS6zDYZ9xcSuWMaY1LtZcZr7ZjMSV1kZ
Lw/sqAJ9/ZWIU2qjQQJ70gyPEU4Hb/x5kSDqqdRcYF4qP8OL4toXVVUwJNnq7NxZ
2Q/q6FHh7iYZvg6xhMp00GfjXB0+qN38ngsLl8IxwRyKurltOs/WI9qlKTVYbehj
dfoGbhLGyU/ekqU8bMdbGwHDx55rt0/3cE8mMNZTje/MMCKIUQ3N4z9htTL/BOII
8CMo3aH4/JnhyWxaTerTe/itJbIF6bZ3
-----END ENCRYPTED PRIVATE KEY-----
`

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
