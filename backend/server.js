const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

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
  } catch (err) {
    console.error("Database connection error:", err.message);
  }
});
