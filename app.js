const express = require("express");
const cors =require("cors");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");


dotenv.config();

const BUSINESS_PHONE_NUMBER = process.env.BUSINESS_PHONE_NUMBER || "918329446654";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "629305560276479";

const app = express();
app.use(cors());
app.use(express.json());

const mongoUri = process.env.DB_URL;
const client = new MongoClient(mongoUri);
let db, collection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("whatsapp");
    collection = db.collection("processed_messages");
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
}
connectDB();

app.get("/",async (req,res)=>{
  return res.status(200).json({
    message:"Healthy"
  })
})

// API: GET All conversations

app.get("/api/conversations", async (req, res) => {
  try {
   
    const businessPhoneNumber = process.env.BUSINESS_PHONE_NUMBER;

    const conversations = await collection
      .aggregate([
        {
          $sort: { timestamp: -1 } 
        },
        {
          $group: {
            _id: "$contact_wa_id",
            lastMessageTime: { $max: "$timestamp" },
            contact_name: { $first: "$contact_name" },
            last_message_text: { $first: "$text" },
            unread_count: {
                $sum: {
                    $cond: [ { $and: [ { $eq: [ "$status", "received" ] }, { $ne: [ "$status", "read" ] } ] }, 1, 0 ]
                }
            }
          },
        },
        {
          $match: {
            _id: { $ne: null, $ne: businessPhoneNumber } 
          }
        },
        { $sort: { lastMessageTime: -1 } },
        {
          $project: {
            _id: 0,
            wa_id: "$_id",
            name: "$contact_name",
            last_message: "$last_message_text",
            last_message_time: "$lastMessageTime",
            unread_count: "$unread_count"
          },
        },
      ])
      .toArray();

    res.json(conversations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Api: GET all messages for a specific wa_id
app.get("/api/messages/:wa_id", async (req, res) => {
  try {
    const { wa_id } = req.params;
    const messages = await collection
      .find({ contact_wa_id: wa_id })
      .sort({ timestamp: 1 })
      .toArray();

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});


// Api: POST Send message

app.post("/api/send", async (req, res) => {
  try {
    const { to, text, name } = req.body; 
    if (!to || !text) {
      return res.status(400).json({ error: "Missing 'to' or 'text' in request body" });
    }


    const newMessage = {
      _id: new ObjectId(), 
      message_id: `wamid.DEMO_${Date.now()}`, 
      from: BUSINESS_PHONE_NUMBER,
      text: text,
      timestamp: new Date(),
      status: "sent", 
      message_type: "text",
      contact_wa_id: to,
      contact_name: name, 
      display_phone_number: BUSINESS_PHONE_NUMBER,
      phone_number_id: PHONE_NUMBER_ID,
      messaging_product: "whatsapp",
      payload_id: `demo-payload-${Date.now()}`,
      gs_app_id: "demo-app",
      object_type: "whatsapp_business_account",
      payload_createdAt: new Date(),
    };

    const result = await collection.insertOne(newMessage);
    res.status(201).json(newMessage);

  } catch (err) {
    console.error("Failed to send message:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

