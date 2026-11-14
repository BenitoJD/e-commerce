const express = require('express');
const { STATES } = require('../../data/states');

const router = express.Router();

// GET /store/states, delivery states with GST state codes. Drives the checkout picker and
// therefore the invoice's place of supply; served from data so there is one list, not two.
router.get('/', (req, res) => {
  res.json({ states: STATES.map((s) => ({ code: s.code, name: s.name })) });
});

module.exports = router;
