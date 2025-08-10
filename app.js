// const { MongoClient } = require("mongodb");
// const fs = require("fs");
// const path = require("path");

// async function main() {
//   const client = new MongoClient("mongodb://127.0.0.1:27017");
//   try {
//     await client.connect();
//     console.log("Connected to MongoDB");

//     const db = client.db("whatsapp");
//     const collection = db.collection("processed_messages");

//     const dirPath = path.join(__dirname, "payloads");
//     const files = fs.readdirSync(dirPath);

//     for (const file of files) {
//       const data = JSON.parse(
//         fs.readFileSync(path.join(dirPath, file), "utf-8")
//       );

//       const entry = data.metaData?.entry?.[0];
//       const changeValue = entry?.changes?.[0]?.value;

//       // If it's a message payload
//       if (Array.isArray(changeValue?.messages)) {
//         for (const msg of changeValue.messages) {
//           const doc = {
//             message_id: msg.id,
//             meta_msg_id: msg.id, // In messages, meta_msg_id may not exist
//             from: msg.from,
//             text: msg.text?.body || null,
//             timestamp: parseInt(msg.timestamp, 10),
//             status:
//               msg.from === changeValue.metadata.display_phone_number
//                 ? "sent"
//                 : "received",
//           };

//           await collection.updateOne(
//             { message_id: doc.message_id },
//             { $setOnInsert: doc },
//             { upsert: true }
//           );
//         }
//       }

//       // If it's a status payload
//       if (Array.isArray(changeValue?.statuses)) {
//         for (const status of changeValue.statuses) {
//           await collection.updateOne(
//             {
//               $or: [
//                 { message_id: status.id },
//                 { meta_msg_id: status.meta_msg_id },
//               ],
//             },
//             {
//               $set: {
//                 status: status.status,
//                 status_timestamp: parseInt(status.timestamp, 10),
//               },
//             },
//             { upsert: true } // Ensure doc is created if not found
//           );
//         }
//       }
//     }

//     console.log("Processing complete.");
//   } catch (err) {
//     console.error(err);
//   } finally {
//     await client.close();
//   }
// }

// main();

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());

const mongoUri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(mongoUri);
let db, collection;

// Connect to MongoDB once at startup
async function connectDB() {
  await client.connect();
  db = client.db("whatsapp");
  collection = db.collection("processed_messages");
  console.log("Connected to MongoDB");
}
connectDB();

// ✅ Get all conversations grouped by user (wa_id)
app.get("/api/conversations", async (req, res) => {
  try {
    const conversations = await collection
      .aggregate([
        {
          $group: {
            _id: "$from", // group by wa_id (user number)
            lastMessageTime: { $max: "$timestamp" },
            name: { $first: "$name" }, // optional, if you stored it
          },
        },
        { $sort: { lastMessageTime: -1 } },
        {
          $project: {
            wa_id: "$_id",
            name: 1,
            _id: 0,
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

// ✅ Get all messages for a specific wa_id
app.get("/api/messages/:wa_id", async (req, res) => {
  try {
    const { wa_id } = req.params;
    const messages = await collection
      .find({
        $or: [{ from: wa_id }, { to: wa_id }],
      })
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
