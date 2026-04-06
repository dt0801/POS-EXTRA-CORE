const { invalidateMenuListCache } = require("./menuListCache");
const parseMenuPriceToCents = require("./parseMenuPriceToCents");

/**
 * @param {{
 *   mongoDb: import("mongodb").Db,
 *   getNextMongoId: (name: string) => Promise<number>,
 *   persistMenuImage: (file: import("multer").File) => Promise<string>,
 * }} deps
 * @param {{ body: object, file?: import("multer").File | undefined }} input
 */
async function createMenuItem(deps, input) {
  const { mongoDb, getNextMongoId, persistMenuImage } = deps;
  const { name, price, type, kitchen_category } = input.body || {};
  try {
    let imageValue = "";
    if (input.file?.buffer) {
      try {
        imageValue = await persistMenuImage(input.file);
      } catch (upErr) {
        return {
          status: 500,
          body: {
            error: upErr.message || String(upErr) || "Upload ảnh thất bại",
          },
        };
      }
    }
    const nextId = await getNextMongoId("menu");
    const itemType = type || "FOOD";
    const doc = {
      sqlite_id: nextId,
      name: name || "",
      price: parseMenuPriceToCents(price),
      type: itemType,
    };
    if (itemType !== "DRINK") {
      const k = String(kitchen_category || "MAIN")
        .trim()
        .slice(0, 64);
      doc.kitchen_category = k || "MAIN";
    }
    if (imageValue) doc.image = imageValue;
    await mongoDb.collection("menu").insertOne(doc);
    invalidateMenuListCache();
    const isUrl = /^https?:\/\//i.test(imageValue);
    return {
      status: 200,
      body: {
        added: true,
        mongoSaved: true,
        mongoError: null,
        imageProvided: Boolean(imageValue),
        imageFilename: isUrl ? null : imageValue || null,
        imageUrl: isUrl ? imageValue : null,
      },
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { createMenuItem };
