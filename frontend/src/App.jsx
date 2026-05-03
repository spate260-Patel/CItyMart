import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API = import.meta.env.VITE_API_URL;

function App() {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [message, setMessage] = useState("");
  const [deleteOrderId, setDeleteOrderId] = useState("");

  const [currentUser, setCurrentUser] = useState(null);
  const [authForm, setAuthForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: ""
  });

  const [reviewForm, setReviewForm] = useState({
    customer_id: "",
    product_id: "",
    branch_id: "",
    rating: "",
    comment: ""
  });

  const [orderForm, setOrderForm] = useState({
    customer_id: "",
    branch_id: "",
    branch_product_id: "",
    quantity: "",
    delivery_street: "",
    delivery_city: "",
    delivery_state: "",
    delivery_zip: ""
  });

  useEffect(() => {
    loadBranches();
    loadReviews();
  }, []);

  const loadBranches = async () => {
    const res = await axios.get(`${API}/api/branches`);
    setBranches(res.data);
  };

  const loadProducts = async () => {
    if (!selectedBranch) return;
    const res = await axios.get(`${API}/api/products/${selectedBranch}`);
    setProducts(res.data);
  };

  const loadOrders = async () => {
    const res = await axios.get(`${API}/api/orders`);
    setOrders(res.data);
  };

  const loadReviews = async () => {
    const res = await axios.get(`${API}/api/reviews`);
    setReviews(res.data);
  };

  const addReview = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/api/reviews`, reviewForm);
      setMessage(res.data.message);
      loadReviews();
      setReviewForm({ customer_id: "", product_id: "", branch_id: "", rating: "", comment: "" });
    } catch (error) {
      setMessage(error.response?.data?.error || "Error adding review");
    }
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/api/orders`, orderForm);
      setMessage(res.data.message);
      loadProducts();
      loadOrders();
      setOrderForm({ customer_id: "", branch_id: "", branch_product_id: "", quantity: "", delivery_street: "", delivery_city: "", delivery_state: "", delivery_zip: "" });
    } catch (error) {
      setMessage(error.response?.data?.error || "Error placing order");
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/api/signup`, {
        first_name: authForm.firstName,
        last_name: authForm.lastName,
        email: authForm.email,
        password: authForm.password
      });
      setCurrentUser({
        customer_id: res.data.customer_id,
        full_name: res.data.full_name
      });
      setOrderForm(prev => ({ ...prev, customer_id: res.data.customer_id }));
      setReviewForm(prev => ({ ...prev, customer_id: res.data.customer_id }));
    } catch (err) {
      alert("Error: " + (err.response?.data?.error || err.message));
    }
  };

  const deleteOrder = async (e) => {
    e.preventDefault();
    if (!deleteOrderId) return;
    try {
      const res = await axios.delete(`${API}/api/orders/${deleteOrderId}`);
      setMessage(res.data.message);
      loadOrders();
      if (selectedBranch) {
        loadProducts();
      }
      setDeleteOrderId("");
    } catch (error) {
      setMessage(error.response?.data?.error || "Error deleting order");
    }
  };

  if (!currentUser) {
    return (
      <div>
        <h2>Sign Up</h2>
        <form onSubmit={handleAuth}>
          <div>
            <label>First Name: </label>
            <input required type="text" value={authForm.firstName} onChange={e => setAuthForm({...authForm, firstName: e.target.value})} />
          </div>
          <br />
          <div>
            <label>Last Name: </label>
            <input required type="text" value={authForm.lastName} onChange={e => setAuthForm({...authForm, lastName: e.target.value})} />
          </div>
          <br />
          <div>
            <label>Email ID: </label>
            <input required type="email" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} />
          </div>
          <br />
          <div>
            <label>Password: </label>
            <input required type="password" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
          </div>
          <br />
          <button type="submit">Sign Up / Log In</button>
        </form>
      </div>
    );
  }

  return (
    <div className="container">
      <div>
        Customer ID: {currentUser.customer_id} | Name: {currentUser.full_name}
        <button onClick={() => setCurrentUser(null)}>Logout</button>
      </div>
      <h1 className="main-heading">CityMart for Users</h1>
      <br></br><br></br>
      {message && <div className="message-box"><strong>Message:</strong> {message}</div>}

      <section className="card">
        <h2>Read Products by Branch</h2>
        <select onChange={(e) => setSelectedBranch(e.target.value)}>
          <option value="">Select Branch</option>
          {branches.map((branch) => (
            <option key={branch.branch_id} value={branch.branch_id}>
              {branch.branch_name}
            </option>
          ))}
        </select>
        <button onClick={loadProducts}>Load Products</button>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Branch Product ID</th>
                <th>Product ID</th>
                <th>Branch ID</th>
                <th>Branch</th>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.branch_product_id}>
                  <td>{p.branch_product_id}</td>
                  <td>{p.product_id}</td>
                  <td>{p.branch_id}</td>
                  <td>{p.branch_name}</td>
                  <td>{p.product_name}</td>
                  <td>{p.category}</td>
                  <td>${p.price}</td>
                  <td>{p.stock_quantity}</td>
                  <td>{p.is_available ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="forms-container">
        <section className="card form-card place-order-card">
          <h2>Place Order</h2>
          <form onSubmit={placeOrder}>
            <div className="input-group">
              <label>Customer ID:</label>
              <input placeholder="Customer ID" value={orderForm.customer_id} required onChange={(e) => setOrderForm({ ...orderForm, customer_id: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Branch ID:</label>
              <input placeholder="Branch ID" value={orderForm.branch_id} required onChange={(e) => setOrderForm({ ...orderForm, branch_id: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Branch Product ID:</label>
              <input placeholder="Branch Product ID" value={orderForm.branch_product_id} required onChange={(e) => setOrderForm({ ...orderForm, branch_product_id: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Quantity:</label>
              <input placeholder="Quantity" type="number" min="1" value={orderForm.quantity} required onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Delivery Street:</label>
              <input placeholder="Delivery Street" value={orderForm.delivery_street} required onChange={(e) => setOrderForm({ ...orderForm, delivery_street: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Delivery City:</label>
              <input placeholder="Delivery City" value={orderForm.delivery_city} required onChange={(e) => setOrderForm({ ...orderForm, delivery_city: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Delivery State:</label>
              <input placeholder="Delivery State" value={orderForm.delivery_state} required onChange={(e) => setOrderForm({ ...orderForm, delivery_state: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Delivery Zip:</label>
              <input placeholder="Delivery Zip" value={orderForm.delivery_zip} required onChange={(e) => setOrderForm({ ...orderForm, delivery_zip: e.target.value })} />
            </div>
            <button type="submit" className="action-btn">Place Order</button>
          </form>
        </section>

        <section className="card form-card create-review-card">
          <h2>Create Review</h2>
          <form onSubmit={addReview}>
            <div className="input-group">
              <label>Customer ID:</label>
              <input placeholder="Customer ID" value={reviewForm.customer_id} required onChange={(e) => setReviewForm({ ...reviewForm, customer_id: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Product ID:</label>
              <input placeholder="Product ID" value={reviewForm.product_id} required onChange={(e) => setReviewForm({ ...reviewForm, product_id: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Branch ID:</label>
              <input placeholder="Branch ID" value={reviewForm.branch_id} required onChange={(e) => setReviewForm({ ...reviewForm, branch_id: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Rating (1-5):</label>
              <input placeholder="Rating 1-5" type="number" min="1" max="5" value={reviewForm.rating} required onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Comment:</label>
              <textarea placeholder="Comment" value={reviewForm.comment} required onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}></textarea>
            </div>
            <button type="submit" className="action-btn">Add Review</button>
          </form>
        </section>
      </div>

      <section className="card">
        <h2>All Customer Reviews</h2>
        <button onClick={loadReviews}>Load Reviews</button>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Review ID</th>
                <th>Customer Name</th>
                <th>Product Name</th>
                <th>Branch Name</th>
                <th>Rating</th>
                <th>Comment</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.review_id}>
                  <td>{r.review_id}</td>
                  <td>{r.customer_name}</td>
                  <td>{r.product_name}</td>
                  <td>{r.branch_name}</td>
                  <td>{r.rating}/5</td>
                  <td>{r.comment}</td>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>View Orders</h2>
        <button onClick={loadOrders}>Load Orders</button>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Branch</th>
                <th>Order Status</th>
                <th>Delivery Status</th>
                <th>Total</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.order_id}>
                  <td>{o.order_id}</td>
                  <td>{o.full_name}</td>
                  <td>{o.branch_name}</td>
                  <td>{o.order_status}</td>
                  <td>{o.delivery_status}</td>
                  <td>${o.total_amount}</td>
                  <td>{o.total_items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Cancel / Delete Existing Order</h2>
        <form onSubmit={deleteOrder}>
          <div className="input-group">
            <label>Order ID:</label>
            <input 
              placeholder="Order ID" 
              value={deleteOrderId} 
              required 
              onChange={(e) => setDeleteOrderId(e.target.value)} 
            />
          </div>
          <p>This will permanently remove the selected order.</p>
          <button type="submit">Delete Order</button>
        </form>
      </section>

    </div>
  );
}

export default App;
