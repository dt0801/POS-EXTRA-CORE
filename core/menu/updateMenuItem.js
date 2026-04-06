const { invalidateMenuListCache } = require("./menuListCache");
const parseMenuPriceToCents = require("./parseMenuPriceToCents");

/**
 * @param {{
 *   mongoDb: import("mongodb").Db,
 *   persistMenuImage: (file: import("multer").File) => Promise<string>,
 * }} deps
 * @param {{ body: object, file?: import("multer").File | undefined, id: string | number }} input
 */
async function updateMenuItem(deps, input) {
  const { mongoDb, persistMenuImage } = deps;
  const { name, price, type, kitchen_category } = input.body || {};
  const { id } = input;
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
    const itemType = type || "FOOD";
    const patch = {
      name: name || "",
      price: parseMenuPriceToCents(price),
      type: itemType,
    };
    if (imageValue) patch.image = imageValue;
    const updateOps = { $set: patch };
    if (itemType === "DRINK") {
      updateOps.$unset = { kitchen_category: "" };
    } else {
      const k = String(kitchen_category || "MAIN")
        .trim()
        .slice(0, 64);
      patch.kitchen_category = k || "MAIN";
    }
    const result = await mongoDb.collection("menu").updateOne({ sqlite_id: Number(id) }, updateOps);
    if (result.matchedCount === 0) return { status: 404, body: { error: "Không tìm thấy món" } };
    invalidateMenuListCache();
    const isUrl = /^https?:\/\//i.test(imageValue);
    return {
      status: 200,
      body: {
        updated: true,
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

module.exports = { updateMenuItem };
