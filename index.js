require('dotenv').config({ path: '.env.local' });
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')

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
app.use(cookieParser())
app.use(morgan('dev'))

const cookieOptions = {
  maxAge: 0,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
}

// middlewares 

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

    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, cookieOptions)
        .send({ success: true })
    })

    // // use verify token/user after verifyToken
    // const verifyToken = (req, res, next) => {
    //   if (!req.headers.authorization) {
    //     return res.status(401).send({ message: 'unauthorized access' });
    //   }
    //   const token = req.headers.authorization.split(' ')[1];
    //   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    //     if (err) {
    //       return res.status(401).send({ message: 'unauthorized access' })
    //     }
    //     req.decoded = decoded;
    //     next();
    //   })
    // }

    // // use verify admin after verifyToken
    // const verifyAdmin = async (req, res, next) => {
    //   const email = req.decoded.email;
    //   const query = { email: email };
    //   const user = await userCollection.findOne(query);
    //   const isAdmin = user?.role === 'admin';
    //   if (!isAdmin) {
    //     return res.status(403).send({ message: 'forbidden access' });
    //   }
    //   next();
    // }

    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', cookieOptions)
          .send({ success: true })
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
    app.post('/create-donate-request', async (req, res) => {
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

    // donation-request/:id delete
    app.delete('/donation-request/:id', async (req, res) => {
      const id = parseInt(req.params.id);
      const result = await donationCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // get donation-request/:id
    app.get('/donation-request/:id', async (req, res) => {
      const id = req.params.id;
      const request = await donationCollection.findOne({ _id: new ObjectId(id) });
      res.send(request);
    });

    // donation-request/:id update
    app.put('/donation-request/:id', async (req, res) => {
      const id = req.params.id;
      const updatedRequest = req.body;
      const result = await donationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedRequest }
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
