const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

async function main() {
  const client = new MongoClient(process.env.DB_URL);
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("whatsapp");
    const collection = db.collection("processed_messages");

    const dirPath = path.join(__dirname, "payloads");
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(dirPath, file), "utf-8")
      );

      const entry = data.metaData?.entry?.[0];
      const changeValue = entry?.changes?.[0]?.value;

      if (!changeValue) {
        console.log(`Skipping file ${file} due to missing data.`);
        continue;
      }

      const metadata = changeValue.metadata;
      const contacts = changeValue.contacts;

      if (Array.isArray(changeValue.messages)) {
        for (const msg of changeValue.messages) {
          const doc = {
            payload_id: data._id,
            gs_app_id: data.metaData.gs_app_id,
            object_type: data.metaData.object,
            messaging_product: changeValue.messaging_product,
            display_phone_number: metadata.display_phone_number,
            phone_number_id: metadata.phone_number_id,
            message_id: msg.id,
            from: msg.from,
            contact_name: contacts?.[0]?.profile?.name,
            contact_wa_id: contacts?.[0]?.wa_id,
            text: msg.text?.body || null,
            message_type: msg.type,
            timestamp: new Date(parseInt(msg.timestamp, 10) * 1000),
            status:
              msg.from === metadata.display_phone_number ? "sent" : "received",
            payload_createdAt: new Date(data.createdAt),
          };

          await collection.updateOne(
            { message_id: doc.message_id },
            { $setOnInsert: doc },
            { upsert: true }
          );
        }
      }

      if (Array.isArray(changeValue.statuses)) {
        for (const status of changeValue.statuses) {
          const updateData = {
            status: status.status,
            status_timestamp: new Date(parseInt(status.timestamp, 10) * 1000),
            conversation_id: status.conversation?.id,
            conversation_origin: status.conversation?.origin?.type,
            conversation_expiration: status.conversation?.expiration_timestamp
              ? new Date(parseInt(status.conversation.expiration_timestamp, 10) * 1000)
              : null,
            is_billable: status.pricing?.billable,
            pricing_category: status.pricing?.category,
            pricing_model: status.pricing?.pricing_model,
          };

          Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);


          await collection.updateOne(
            { message_id: status.id },
            { $set: updateData },
            { upsert: true } 
          );
        }
      }
    }

    console.log("Processing complete.");
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}


main();