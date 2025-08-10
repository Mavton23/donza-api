const Enrollment = sequelize.define('Enrollment', {
    // ... campos existentes ...
  }, {
    hooks: {
      afterDestroy: async (enrollment) => {
        // Atualizar estatísticas do curso quando uma matrícula é removida
        try {
          const course = await sequelize.models.Course.findByPk(enrollment.courseId);
          if (course) {
            await course.update({
              'metrics.enrollments': sequelize.literal('metrics.enrollments - 1')
            });
          }
        } catch (error) {
          console.error('Error updating course metrics:', error);
        }
      }
    }
  });