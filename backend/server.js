const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const OpenAI = require("openai");
require("dotenv").config();

const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const hasS3Config =
  Boolean(process.env.AWS_REGION) &&
  Boolean(process.env.AWS_ACCESS_KEY_ID) &&
  Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
  Boolean(process.env.AWS_S3_BUCKET);

const s3Client = hasS3Config
  ? new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    })
  : null;

const safeFilename = (name) =>
  String(name || "file")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-");

const getS3PublicUrl = (objectKey) => {
  if (process.env.AWS_S3_PUBLIC_BASE_URL) {
    return `${process.env.AWS_S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectKey}`;
  }
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${objectKey}`;
};

const ensureMediaTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_media (
      media_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      product_id INT NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
      branch_id INT REFERENCES branch(branch_id) ON DELETE SET NULL,
      object_key VARCHAR(512) NOT NULL UNIQUE,
      media_url TEXT NOT NULL,
      media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'video')),
      title VARCHAR(150),
      description TEXT,
      uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

app.get("/", (req, res) => {
  res.send("CityMart backend is running");
});

app.get("/api/branches", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM branch ORDER BY branch_id");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products/:branchId", async (req, res) => {
  try {
    const { branchId } = req.params;

    const result = await pool.query(
      `SELECT 
        bp.branch_product_id,
        p.product_id,
        b.branch_id,
        b.branch_name,
        p.name AS product_name,
        p.category,
        bp.price,
        bp.stock_quantity,
        bp.is_available
       FROM branch_product bp
       JOIN branch b ON b.branch_id = bp.branch_id
       JOIN product p ON p.product_id = bp.product_id
       WHERE b.branch_id = $1
       ORDER BY p.name`,
      [branchId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products/:productId/media", async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await pool.query(
      `SELECT
        pm.media_id,
        pm.product_id,
        pm.branch_id,
        pm.object_key,
        pm.media_url,
        pm.media_type,
        pm.title,
        pm.description,
        pm.uploaded_at
       FROM product_media pm
       WHERE pm.product_id = $1
       ORDER BY pm.uploaded_at DESC`,
      [productId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/products/:productId/media/presign-upload", async (req, res) => {
  try {
    if (!s3Client) {
      return res.status(500).json({
        error:
          "S3 is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET."
      });
    }

    const { productId } = req.params;
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({ error: "fileName and contentType are required" });
    }

    if (!/^image\/|^video\//.test(contentType)) {
      return res.status(400).json({ error: "Only image/* and video/* content types are allowed" });
    }

    const productCheck = await pool.query("SELECT product_id FROM product WHERE product_id = $1", [productId]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const objectKey = `products/${productId}/${Date.now()}-${randomUUID()}-${safeFilename(fileName)}`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: objectKey,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    res.json({
      message: "Pre-signed upload URL generated",
      upload_url: uploadUrl,
      object_key: objectKey,
      media_url: getS3PublicUrl(objectKey),
      expires_in_seconds: 300
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/products/:productId/media", async (req, res) => {
  try {
    const { productId } = req.params;
    const { branch_id, object_key, media_type, title, description } = req.body;

    if (!object_key || !media_type) {
      return res.status(400).json({ error: "object_key and media_type are required" });
    }

    if (!["image", "video"].includes(media_type)) {
      return res.status(400).json({ error: "media_type must be 'image' or 'video'" });
    }

    const productCheck = await pool.query("SELECT product_id FROM product WHERE product_id = $1", [productId]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (branch_id) {
      const branchCheck = await pool.query("SELECT branch_id FROM branch WHERE branch_id = $1", [branch_id]);
      if (branchCheck.rows.length === 0) {
        return res.status(404).json({ error: "Branch not found" });
      }
    }

    const mediaUrl = getS3PublicUrl(object_key);

    const result = await pool.query(
      `INSERT INTO product_media
       (product_id, branch_id, object_key, media_url, media_type, title, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [productId, branch_id || null, object_key, mediaUrl, media_type, title || null, description || null]
    );

    res.json({
      message: "Product media saved successfully",
      media: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        o.order_id,
        c.full_name,
        b.branch_name,
        o.order_status,
        o.delivery_status,
        o.total_amount,
        COUNT(oi.order_item_id) AS total_items
       FROM orders o
       JOIN customer c ON c.customer_id = o.customer_id
       JOIN branch b ON b.branch_id = o.branch_id
       LEFT JOIN order_item oi ON oi.order_id = o.order_id
       GROUP BY o.order_id, c.full_name, b.branch_name,
                o.order_status, o.delivery_status, o.total_amount
       ORDER BY o.order_id`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const {
      customer_id,
      branch_id,
      branch_product_id,
      quantity,
      delivery_street,
      delivery_city,
      delivery_state,
      delivery_zip
    } = req.body;

    const productResult = await pool.query(
      `SELECT price, stock_quantity
       FROM branch_product
       WHERE branch_product_id = $1 AND branch_id = $2`,
      [branch_product_id, branch_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: "Product not found for this branch" });
    }

    const price = Number(productResult.rows[0].price);
    const stock = Number(productResult.rows[0].stock_quantity);
    const qty = Number(quantity);

    if (qty <= 0) {
      return res.status(400).json({ error: "Quantity must be greater than 0" });
    }

    if (stock < qty) {
      return res.status(400).json({ error: "Not enough stock available" });
    }

    const totalAmount = price * qty;

    const orderIdResult = await pool.query('SELECT MAX(order_id) FROM orders');
    let orderId = 1;
    if (orderIdResult.rows[0].max !== null) {
      orderId = orderIdResult.rows[0].max + 1;
    }

    const orderItemIdResult = await pool.query('SELECT MAX(order_item_id) FROM order_item');
    let orderItemId = 1;
    if (orderItemIdResult.rows[0].max !== null) {
      orderItemId = orderItemIdResult.rows[0].max + 1;
    }

    await pool.query(
      `INSERT INTO orders
       (order_id, customer_id, branch_id, order_status, total_amount, delivery_status,
        delivery_street, delivery_city, delivery_state, delivery_zip)
       VALUES
       ($1, $2, $3, 'Placed', $4, 'Pending', $5, $6, $7, $8)`,
      [
        orderId,
        customer_id,
        branch_id,
        totalAmount,
        delivery_street,
        delivery_city,
        delivery_state,
        delivery_zip
      ]
    );

    await pool.query(
      `INSERT INTO order_item
       (order_item_id, order_id, branch_product_id, quantity, unit_price_at_purchase)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderItemId, orderId, branch_product_id, qty, price]
    );

    await pool.query(
      `UPDATE branch_product
       SET stock_quantity = stock_quantity - $1
       WHERE branch_product_id = $2`,
      [qty, branch_product_id]
    );

    res.json({
      message: "Order placed successfully",
      order_id: orderId,
      total_amount: totalAmount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reviews", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        r.review_id,
        c.full_name AS customer_name,
        p.name AS product_name,
        b.branch_name,
        r.rating,
        r.comment,
        r.created_at
       FROM review r
       JOIN customer c ON c.customer_id = r.customer_id
       JOIN product p ON p.product_id = r.product_id
       JOIN branch b ON b.branch_id = r.branch_id
       ORDER BY r.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/reviews", async (req, res) => {
  try {
    const { customer_id, product_id, branch_id, rating, comment } = req.body;

    const idResult = await pool.query('SELECT MAX(review_id) FROM review');
    let reviewId = 1;
    if (idResult.rows[0].max !== null) {
      reviewId = idResult.rows[0].max + 1;
    }

    const result = await pool.query(
      `INSERT INTO review 
       (review_id, customer_id, product_id, branch_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [reviewId, customer_id, product_id, branch_id, rating, comment]
    );

    res.json({
      message: "Review added successfully",
      review: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai/reviews/summary", async (req, res) => {
  try {
    if (!openaiClient) {
      return res.status(500).json({
        error: "OpenAI is not configured. Set OPENAI_API_KEY in backend/.env."
      });
    }

    const { product_id, max_reviews = 20 } = req.body;
    if (!product_id) {
      return res.status(400).json({ error: "product_id is required" });
    }

    const reviewsResult = await pool.query(
      `SELECT
        p.name AS product_name,
        r.rating,
        r.comment,
        r.created_at
       FROM review r
       JOIN product p ON p.product_id = r.product_id
       WHERE r.product_id = $1
         AND r.comment IS NOT NULL
         AND LENGTH(TRIM(r.comment)) > 0
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [product_id, max_reviews]
    );

    if (reviewsResult.rows.length === 0) {
      return res.status(404).json({ error: "No review comments found for this product" });
    }

    const productName = reviewsResult.rows[0].product_name;
    const reviewLines = reviewsResult.rows
      .map((row, i) => `${i + 1}. Rating ${row.rating}/5: ${row.comment}`)
      .join("\n");

    const response = await openaiClient.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You summarize product feedback for a retail app. Be concise, factual, and include both positives and negatives."
        },
        {
          role: "user",
          content: `Summarize the following customer reviews for product "${productName}".

Return JSON with keys:
- summary (string)
- positives (array of short strings)
- concerns (array of short strings)
- average_sentiment (one of: positive, mixed, negative)

Reviews:
${reviewLines}`
        }
      ],
      text: {
        format: {
          type: "json_object"
        }
      }
    });

    const parsed = JSON.parse(response.output_text);

    res.json({
      product_id,
      product_name: productName,
      review_count: reviewsResult.rows.length,
      ai_summary: parsed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/stock/:branchProductId", async (req, res) => {
  try {
    const { branchProductId } = req.params;
    const { stock_quantity } = req.body;

    const result = await pool.query(
      `UPDATE branch_product
       SET stock_quantity = $1
       WHERE branch_product_id = $2
       RETURNING *`,
      [stock_quantity, branchProductId]
    );

    res.json({
      message: "Stock updated successfully",
      product: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/reviews/:reviewId", async (req, res) => {
  try {
    const { reviewId } = req.params;

    await pool.query(
      "DELETE FROM review WHERE review_id = $1",
      [reviewId]
    );

    res.json({ message: "Review deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderCheck = await pool.query(
      "SELECT order_id FROM orders WHERE order_id = $1",
      [orderId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const itemsResult = await pool.query(
      `SELECT branch_product_id, quantity
       FROM order_item
       WHERE order_id = $1`,
      [orderId]
    );

    for (const item of itemsResult.rows) {
      await pool.query(
        `UPDATE branch_product
         SET stock_quantity = stock_quantity + $1
         WHERE branch_product_id = $2`,
        [item.quantity, item.branch_product_id]
      );
    }

    await pool.query(
      "DELETE FROM orders WHERE order_id = $1",
      [orderId]
    );

    res.json({
      message: "Order deleted successfully and stock restored"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/signup", async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;
    const full_name = `${first_name} ${last_name}`;

    const existing = await pool.query("SELECT * FROM customer WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      return res.json({
        message: "Logged in successfully",
        customer_id: user.customer_id,
        full_name: user.full_name
      });
    }

    const idResult = await pool.query("SELECT MAX(customer_id) FROM customer");
    let customerId = 1;
    if (idResult.rows[0].max !== null) {
      customerId = idResult.rows[0].max + 1;
    }

    const result = await pool.query(
      `INSERT INTO customer (customer_id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING customer_id, full_name`,
      [customerId, full_name, email, password]
    );

    res.json({
      message: "Profile created successfully",
      customer_id: result.rows[0].customer_id,
      full_name: result.rows[0].full_name
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 5000, async () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("Database connection successful:", res.rows[0].now);
    await ensureMediaTable();
    console.log("Media metadata table is ready");
  } catch (err) {
    console.error("Database connection error:", err.message);
  }
});
