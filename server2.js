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
MIIFJDBWBgkqhkiG9w0BBQ0wSTAxBgkqhkiG9w0BBQwwJAQQXk/R9nWnPlyLbABv
zdi2YgICCAAwDAYIKoZIhvcNAgkFADAUBggqhkiG9w0DBwQI1ALNbYbmhWAEggTI
pTPSAT7bCNFdDlLm6QJjVXCwP/lhTA6GD+mRiKtNVrKC+ABxMEcel01wdFUgM048
pysrGkwhxE5i1Ze4RH8bYH+4NY7DgyxT8iR3ZZugYk8kyBYq5dSRy/GiPejVmpaK
uNTovhByynlzuBFyKYllHDveiB4WSvx7/4nCMniVlOlu0O8/H8WrZRG/mmM3xaTm
PgxK1s/IIX8nPDxAA0L+iVEPQ5lvklVwlo1eRrXug39ma0x4U1Em7LEU6Yp4OCGp
+xnIRgKbH2RzwI5yVoBWupbWfZaR5TMSL3zAxAMbc7/rihqfAdFdUnOwi5r1AOiW
4kSuPs6SrqLnjGhlGg+QcLLBpKbLogMi4KyFBoEm5RE65vL0Mzt0oXF6ZAujCmsB
1ewg1mljw4ZOWj1SGYY6TyOGojMc57zlgqedb5DPyo3+BCeE91+nx31siMyLrCWs
uyQPqClZomls8lbFsGJVe9+jAjZRcjL7szydrmSdEUzh9ep1bo0cuyJljrferZ8j
spEzufAwiqsudgWGC+bIVjVmRcTXTK+woapFtee7DDP78lcg+5TP3mjhn73wJ/Zj
2j8KBbejwhGeMkOYXDa7/SvDnWSeixNs4IyXnany/eQUWVZIBgLP4s7eJ2x9EJUC
/qsDLip2c3LESjG0gCBlVY0Ss0u/tZ5Nzzg4WYQH1swCIyJ+h97EsLBhH8u5Dt4i
SwUndZdFDTLfFtE5pQzm3bFpIJNgJXv31MDw9baNAvMH0K+ndT295X5M7xV3NNop
3NqZoT1edrhmI+mNC+j2NB+qI/4sef5YiQwVdx5z7BBPsvW2un8PKNSt/dGCXcuj
FUVPatlzCzG/ETpgLT0M4+MYF4K0EmRI2heuig8eNDkvythxBDzLXezTrIllovef
GLmWYlM5+7yA3qAANR2hIFpKVdRzdCwQKj0289G8R87pKEdemEk7ZQOwQCQtVFPj
APLg/zQ+TyyjGqu9TPy0siIFMelZ0MGBlIzqjxO2ZqZZeAZAlLWce3iRemrRu3nx
+6/03vhbhPhqYWb8bAcdmtWV6XJS7PVlAF0azJFJ77DNJFpl3XwfSIPgMqJZPs06
SCUpPzyPxvx2yQpu0sdk2ftOYGgHdY7/7nkJASkuzWYdY3SKIxA5SzZV/T+w5hhG
ChyfQye1+FuQ2QOF56sKZy4JzLipLl2EhltifpxwcQcm38n1KCBszpISDZGUEnyG
96/mEAmjeUHBoH8kVN9CkrvGYgNJZNFDB7e9zPacsZ9ARmCZiYxP47nbIbtC4/Y7
Xx7w0d+88qfpnLyUs+g+u5IepQp5ynPlZAmVZaHTW/Sr2Qeu9K+JqvsIFLKss3VD
uRc07XahUV9SB6Q1n0q24YK69wsC3t9pEwlBxiVAm6P1y4Xsd/fe3FhV8vMsZ5Po
u7wvKkBsqhelj9MMNpIcPgWw8sgbwZiwgpNjak2cleyBdubWKX6tCKwPY1dOA4M2
2g/JkRlvoaVPlOLZY4QEqn/mpq0XhUUbfCNwHzUPEThjTpH7YcK04mPE/TUOIgxB
kYqGmoVO+OlME9T0ZJFZQfTUKqaNXrhFd9PCXQ4As1Td6oij+T2PQw583NkMShXH
WUeQP1tuUPmIU68Ywt2mejvpE0/qDLYD
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
