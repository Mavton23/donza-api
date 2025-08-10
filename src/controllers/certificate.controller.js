const { Certificate, Course, Event, User } = require('../models');

module.exports = {
    getUserCertificates: async (req, res, next) => {
    console.log("USER: ", req.user)
    try {
        const { userId } = req.user;
        
        const certificates = await Certificate.findAll({
        where: { 
            userId,
            status: 'issued'
        },
        include: [
            {
            model: Course,
            as: 'course',
            attributes: ['courseId', 'title', 'coverImageUrl'],
            include: [{
                model: User,
                as: 'instructor',
                attributes: ['userId', 'username']
            }]
            },
            {
            model: Event,
            as: 'event',
            attributes: ['eventId', 'title', 'startDate'],
            include: [{
                model: User,
                as: 'organizer',
                attributes: ['userId', 'username']
            }]
            }
        ],
        order: [['issueDate', 'DESC']]
        });

        if (!certificates || certificates.length === 0) {
        return res.status(200).json({
            success: true,
            data: [],
            message: 'No certificates found for this user'
        });
        }

        const formattedCertificates = certificates.map(cert => {
        const baseCert = {
            id: cert.certificateId,
            title: cert.course ? cert.course.title : cert.event.title,
            issuedDate: cert.issueDate,
            expirationDate: cert.expirationDate,
            credentialId: cert.credentialId,
            downloadUrl: cert.downloadUrl,
            verificationUrl: cert.verificationUrl,
            hours: cert.hours
        };

        if (cert.course) {
            baseCert.course = {
            title: cert.course.title,
            hours: cert.hours,
            instructor: cert.course.instructor.name,
            image: cert.course.coverImageUrl
            };
        } else if (cert.event) {
            baseCert.event = {
            title: cert.event.title,
            date: cert.event.startDate,
            organizer: cert.event.organizer.name
            };
        }

        return baseCert;
        });

        res.json(formattedCertificates);

    } catch (error) {
        console.error('Error fetching certificates:', error);
        next(error);
    }
},

downloadCertificate: async (req, res, next) => {
  try {
    const { certificateId } = req.params;
    const { userId } = req.user;

    const certificate = await Certificate.findOne({
      where: {
        certificateId,
        userId,
        status: 'issued'
      }
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found or unauthorized'
      });
    }

    // TO DO: Lógica de geração do PDF
    // ou redirecionamento para o arquivo já gerado
    res.json({
      success: true,
      url: certificate.downloadUrl
    });

  } catch (error) {
    next(error);
  }

}
};