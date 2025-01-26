require('dotenv').config({ path: '.env.local' });
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 3000
const app = express()

// middleware
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://bloodflow.netlify.app'
  ],
  credentials: true,
  optionSuccessStatus: 200,
}

app.use(cors(corsOptions))
app.use(express.json())
app.use(morgan('dev'))

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nw7sq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {

    // await client.connect();
    const userCollection = client.db("BloodFlow").collection("Users");
    const donationCollection = client.db("BloodFlow").collection("Donation");
    const fundsCollection = client.db("BloodFlow").collection("Funds");
    const blogCollection = client.db("BloodFlow").collection("Blogs");

    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1d',
      })
      res.send({ success: true, token })
    })

    // use verify token/user after verifyToken
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        console.log('no authorization header');
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization;
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          console.log('jwt verify error',);
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // use verify Volunteer after verifyToken
    const verifyVolunteer = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'volunteer' || user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // verify active user;
    const verifyActive = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isActive = user?.status === 'active';
      if (!isActive) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res.send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // My Apis...
    // Get user data
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne({ email: email });
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
        res.send(user);
      } catch (err) {
        res.status(500).send({ message: 'Internal server error', error: err });
      }
    });

    // Update user data
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const updatedUser = req.body;
      try {
        const result = await userCollection.updateOne(
          { email: email },
          { $set: updatedUser }
        );
        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'User not found' });
        }
        res.send({ message: 'User updated successfully' });
      } catch (err) {
        console.log(err)
        res.status(500).send({ message: 'Internal server error', error: err });
      }
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne({ ...user, role: 'donor', status: 'active' });
      res.send(result);
    });

    // Create donate request
    app.post('/create-donate-request', verifyToken, verifyActive, async (req, res) => {
      const donateRequest = req.body;
      const result = await donationCollection.insertOne({ ...donateRequest, donationStatus: 'pending' });
      res.send(result);
    });

    // Get donate requests by email & limit
    app.get('/donation-request', async (req, res) => {
      const email = req.query.email;
      const limit = req.query.limit;
      const query = {
        requesterEmail: email
      };
      const requests = await donationCollection.find(query).limit(3).toArray();
      res.send(requests);
    });

    // Get all donation requests
    app.get('/donation-requests', async (req, res) => {
      const { donationStatus } = req.query;
      const query = {};
      if (donationStatus) query.donationStatus = donationStatus;
      const requests = await donationCollection.find(query).toArray();
      res.send(requests);
    });

    // all donation request count ;
    app.get('/all-donation-count', async (req, res) => {
      const { status } = req.query;
      const query = {}
      if (status) query.donationStatus = status;
      const count = await donationCollection.countDocuments(query);
      res.send({ count });
    });

    // Get all donation requests;
    app.get('/all-blood-donation-request', async (req, res) => {
      const { filter } = req.query;
      const query = {};
      if (filter) query.donationStatus = filter;
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 0;
      const requests = await donationCollection.find(query).skip(skip).limit(limit).toArray();
      res.send(requests);
    });

    // all-my-donation-count;
    app.get('/all-my-donation-count', async (req, res) => {
      const { status, email } = req.query;
      const query = { requesterEmail: email }
      if (status) query.donationStatus = status;
      const count = await donationCollection.countDocuments(query);
      res.send({ count });
    });

    // donation-request-all-my/:email
    app.get('/my-all-donation-request/:email', async (req, res) => {
      const email = req.params.email;
      const { filter } = req.query;
      const query = { requesterEmail: email };
      if (filter) query.donationStatus = filter;
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 0;
      const requests = await donationCollection.find(query).skip(skip).limit(limit).toArray();
      res.send(requests);
    });

    // donation-request/:id delete
    app.delete('/donation-request/:id', async (req, res) => {
      const id = req.params.id;
      const result = await donationCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // get donation-request/:id
    app.get('/donation-request/:id', async (req, res) => {
      const id = req.params.id;
      const request = await donationCollection.findOne({ _id: new ObjectId(id) });
      res.send(request);
    });

    // donation-request/:id update with put;

    app.put('/donation-request/:id', async (req, res) => {
      const id = req.params.id;
      const { donationStatus, donorEmail, donorName } = req.body;
      const updatedData = { donationStatus };
      if (donorEmail) updatedData.donorEmail = donorEmail;
      if (donorEmail) updatedData.donorName = donorName;
      const result = await donationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // donation-request/:id update with patch;
    app.patch('/donation-requests/:id', async (req, res) => {
      const id = req.params.id;
      const { _id, requesterName, requesterEmail, donationStatus, donorEmail, donorName, ...updateData } = req.body;
      const result = await donationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
      res.send(result);
    });

    // get donor by filter query
    app.get('/donors/search', async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;
      const query = {};
      if (bloodGroup) query.bloodGroup = bloodGroup;
      if (district) query.district = district;
      if (upazila) query.upazila = upazila;
      if (Object.keys(query).length === 0) return res.send([]);
      const donors = await userCollection.find(query).toArray();
      res.send(donors);
    });

    // all-users get
    app.get('/all-users', async (req, res) => {
      const { status } = req.query;
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 0;
      const query = status ? { status } : {};
      const users = await userCollection.find(query).skip(skip).limit(limit).toArray();
      res.send(users);
    });

    // only total user count
    app.get('/all-users-count', async (req, res) => {
      const { status } = req.query;
      const query = status ? { status } : {};
      const count = await userCollection.countDocuments(query);
      res.send({ count });
    });

    // patch request for user status update by admin only ;
    app.patch('/user/:id/status', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    // patch request for user role update by admin only ;
    app.patch('/user/:id/role', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const role = req.body.role;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    // get funds
    app.get('/funds', verifyToken, async (req, res) => {
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 0;
      const funds = await fundsCollection.find().skip(skip).limit(limit).toArray();
      res.send(funds);
    });

    // get total Funds Count;
    app.get('/founds-counts', async (req, res) => {
      const count = await fundsCollection.estimatedDocumentCount();
      res.send({ count });
    })

    // funds
    app.post('/funds', async (req, res) => {
      const fund = req.body;
      const result = await fundsCollection.insertOne(fund);
      res.send(result);
    });

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseInt(amount * 100),
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    // get blogs;
    app.get('/blogs', verifyToken, verifyVolunteer, async (req, res) => {
      const { status } = req.query;
      const query = status ? { status } : {};
      const blogs = await blogCollection.find(query).toArray();
      res.send(blogs);
    });

    // get blogs-published;
    app.get('/blogs-published', async (req, res) => {
      const query = { status: 'published' };
      const blogs = await blogCollection.find(query).toArray();
      res.send(blogs);
    });

    // Post a blog;
    app.post('/blogs', async (req, res) => {
      const blog = req.body;
      const result = await blogCollection.insertOne({ ...blog, status: 'draft' });
      res.send(result);
    });

    // get blog by id;
    app.get('/blogs/:id', async (req, res) => {
      const id = req.params.id;
      const blog = await blogCollection.findOne({ _id: new ObjectId(id) });
      res.send(blog);
    });

    // delete blog;
    app.delete('/blog/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // patch blog status;
    app.patch('/blogs/:id', verifyToken, verifyVolunteer, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const result = await blogCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    // Form admin Only - Dashboard Home;
    // all user count -
    app.get("/admin/users/count", async (req, res) => {
      try {
        const userCount = await userCollection.countDocuments({ role: 'donor' });
        res.send({ count: userCount });
      } catch (error) {
        console.log("Error fetching user count:", error);
        res.status(500).send({ error: "Failed to fetch user count" });
      }
    });

    // total funding count -
    app.get("/admin/funding/total", async (req, res) => {
      try {
        const totalFunding = await fundsCollection.aggregate([
          { $group: { _id: null, total: { $sum: { $toDouble: "$fundAmount" } } } }
        ]).toArray();

        res.send({ total: totalFunding[0]?.total || 0 });
      } catch (error) {
        console.log("Error fetching total funding:", error);
        res.status(500).send({ error: "Failed to fetch total funding" });
      }
    });

    // all donation-request count -
    app.get("/admin/blood-requests/count", async (req, res) => {
      try {
        const requestCount = await donationCollection.countDocuments();
        res.send({ count: requestCount });
      } catch (error) {
        console.log("Error fetching blood request count:", error);
        res.status(500).send({ error: "Failed to fetch blood request count" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from BloodFlow Server..')
})

app.listen(port, () => {
  console.log(`BloodFlow is running on port ${port}`)
})
