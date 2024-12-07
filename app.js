const express = require('express');
const multer = require('multer');
const firebaseAdmin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const tf = require('@tensorflow/tfjs-node');  // Pastikan hanya menggunakan tfjs-node

// Inisialisasi Firebase
const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');  // Ubah ke path yang sesuai
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(require(serviceAccountPath)),
});

const db = firebaseAdmin.firestore();

// Konfigurasi Multer untuk file upload
const upload = multer({
  limits: { fileSize: 1000000 }, // Maksimal ukuran file 1MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('File harus berupa gambar'));
    }
  },
});

// Inisialisasi aplikasi Express
const app = express();
app.use(cors());
app.use(express.json());

// Middleware Error Handling Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(413).json({
      status: 'fail',
      message: 'Payload content length greater than maximum allowed: 1000000',
    });
  } else if (err) {
    return res.status(400).json({
      status: 'fail',
      message: err.message || 'Terjadi kesalahan dalam melakukan prediksi',
    });
  }
  next();
};

// Memuat model
let model;
const loadModel = async () => {
  try {
    // Gunakan jalur model yang benar untuk sistem WSL atau Linux
    const modelPath = '/mnt/d/BANGKIT 2024/Submission-Cancer-Prediction/models/model.json'; // Pastikan jalur ini benar
    console.log("Model path:", modelPath);
    model = await tf.loadLayersModel(`file://${modelPath}`);
    console.log('Model loaded successfully');
  } catch (err) {
    console.error('Error loading model:', err);
  }
};
loadModel();

// Endpoint untuk prediksi
app.post('/predict', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'fail',
        message: 'File gambar tidak ditemukan',
      });
    }

    // Ubah gambar menjadi tensor, resize, dan normalisasi
    const imageBuffer = req.file.buffer;
    let imageTensor = tf.node.decodeImage(imageBuffer);
    imageTensor = tf.image.resizeBilinear(imageTensor, [224, 224]); // Sesuaikan dimensi model
    imageTensor = imageTensor.div(tf.scalar(255));  // Normalisasi ke [0, 1]

    // Periksa apakah model berhasil dimuat
    if (!model) {
      return res.status(500).json({
        status: 'fail',
        message: 'Model belum berhasil dimuat',
      });
    }

    // Prediksi menggunakan model
    const prediction = await model.predict(imageTensor.expandDims(0));  // Tambah dimensi untuk batch
    const modelPrediction = prediction.dataSync()[0];  // Ambil hasil prediksi
    const result = modelPrediction > 0.5 ? 'Cancer' : 'Non-cancer';
    const suggestion = result === 'Cancer'
      ? 'Segera periksa ke dokter!'
      : 'Penyakit kanker tidak terdeteksi.';

    // Simpan ke Firestore
    const predictionRef = db.collection('predictions').doc();
    const createdAt = new Date().toISOString();
    await predictionRef.set({
      id: predictionRef.id,
      result,
      suggestion,
      createdAt,
    });

    res.json({
      status: 'success',
      message: 'Model is predicted successfully',
      data: {
        id: predictionRef.id,
        result,
        suggestion,
        createdAt,
      },
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'fail',
      message: 'Terjadi kesalahan dalam melakukan prediksi',
    });
  }
});

// Endpoint untuk riwayat prediksi
app.get('/predict/histories', async (req, res) => {
  try {
    const snapshot = await db.collection('predictions').get();
    const histories = snapshot.docs.map((doc) => ({
      id: doc.id,
      history: doc.data(),
    }));

    res.json({
      status: 'success',
      data: histories,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'fail',
      message: 'Terjadi kesalahan saat mengambil riwayat prediksi',
    });
  }
});

// Menjalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
