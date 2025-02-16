require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const WHATSAPP_API_URL = "https://graph.facebook.com/v17.0";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = 'EAAJJvHiFZCysBO1lUJScZCcH6uU5pn71aTYbgw7MTiDxMiAMATBXguodKeFGDvUbnlY0wggt1rmq4QwnwdF1VmH8WlZBVTYXO9A09Ii13ln2anxK1fUGB3DYxyD8HO8BPbBlM6ZBIAZAe6K2IZApIEhRWRzbecZBikpqrdIXI48gsRZCfF1sEmVleMFe9dit7PAlL8KAKvFGFf4H7M5xjDLRDe9S5KoZD';

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

const receivedMessages = [];

// ✅ 1. API to Send WhatsApp Messages
app.post("/send-message", async (req, res) => {
  const { to, message, imageUrl } = req.body; // Accept `imageUrl` for sending images

  let payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };

  if (imageUrl) {
    payload.type = "image";
    payload.image = { link: imageUrl }; // Hosted image URL
  } else {
    payload.type = "text";
    payload.text = { body: message };
  }

  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
const newMessage = {
      to,
      text: message ,
      imageUrl,
      timestamp:Math.floor(Date.now() / 1000);,
    };
    receivedMessages.push(newMessage);
    console.log("New message stored:", newMessage);
    res.json({ success: true, response: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data });
  }
});


// ✅ 2. Webhook Verification (Meta Calls This First)
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "desitestt1";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Verification failed");
  }
});
const fetchWhatsAppMedia = async (mediaId, callback) => {
  try {
    // Step 1: Get Media URL
    const mediaResponse = await axios.get(
      `https://graph.facebook.com/v17.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }, // Ensure token is correct
      }
    );
    const mediaUrl = mediaResponse.data.url; // Get media download URL

    // Step 2: Download Image
    const imageResponse = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }, // Required for fetching media
      responseType: "arraybuffer", // Binary response for image
    });

    // Convert to base64
    const imageBase64 = Buffer.from(imageResponse.data, "binary").toString("base64");
    const imageUrl = `data:image/jpeg;base64,${imageBase64}`;

    callback(imageUrl);
  } catch (error) {
    console.error("Error fetching image:", error.response?.data || error.message);
    callback(null);
  }
};


app.post("/webhook", async (req, res) => {
  console.log("Received WhatsApp Message:", JSON.stringify(req.body, null, 2));

  if (req.body.object === "whatsapp_business_account") {
    req.body.entry.forEach((entry) => {
      entry.changes.forEach((change) => {
        if (change.value.messages) {
          const message = change.value.messages[0];
          const timestamp = new Date(message.timestamp * 1000).toLocaleString();
          let receivedMsg = { from: message.from, timestamp };

          if (message.type === "text") {
            receivedMsg.text = message.text.body;
          } else if (message.type === "image") {
            const mediaId = message.image.id;
            receivedMsg.imageUrl = `Fetching image...`;
            fetchWhatsAppMedia(mediaId, (imageUrl) => {
              receivedMsg.imageUrl = imageUrl;
            });
          }

          receivedMessages.push(receivedMsg);
          console.log("Stored Message:", receivedMsg);
        }
      });
    });
  }

  res.sendStatus(200);
});


// ✅ 4. API to Retrieve Stored Messages
app.get("/messages", (req, res) => {
  res.json(receivedMessages);
});

// Start Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
