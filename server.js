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
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

app.post("/send-message", async (req, res) => {
  const { to, message } = req.body;

  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true, response: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.response.data });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
