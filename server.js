const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5173;

app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));
app.use(express.static(path.join(__dirname, 'public')));

// Fallback for SPA routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FTTH Kalkulator running at http://localhost:${PORT}`);
});