const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificate.controller');
const authenticate = require('../middleware/authenticate');

router.get('/', authenticate, certificateController.getUserCertificates);

router.get('/:certificateId/download', authenticate, certificateController.downloadCertificate);

module.exports = router;