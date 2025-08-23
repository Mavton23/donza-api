const { Billing, Invoice, User } = require('../models');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { Op } = require('sequelize');

module.exports = {
    // Obter métodos de pagamento do usuário
    getMethods: async (req, res, next) => {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.userId;

            // Verificar se o usuário tem acesso aos dados
            if (userId !== currentUserId && req.user.role !== 'admin') {
                throw new ForbiddenError('Você não tem permissão para acessar estes dados');
            }

            // Buscar informações de billing do usuário
            const billing = await Billing.findOne({
                where: { institutionId: userId },
                include: [{
                    model: Invoice,
                    as: 'invoices',
                    order: [['createdAt', 'DESC']],
                    limit: 10
                }]
            });

            if (!billing) {
                return res.json({
                    success: true,
                    data: {
                        paymentMethods: [],
                        billingInfo: null
                    }
                });
            }

            // Formatar métodos de pagamento
            const paymentMethods = [];
            if (billing.paymentMethod && billing.cardLast4) {
                paymentMethods.push({
                    id: billing.billingId,
                    last4: billing.cardLast4,
                    brand: billing.paymentMethod === 'credit_card' ? 'visa' : 'other',
                    expiry: '12/25', // TO DO: Armazenar esta informação no db
                    isDefault: true
                });
            }

            res.json({
                success: true,
                data: {
                    paymentMethods,
                    billingInfo: {
                        plan: billing.plan,
                        status: billing.status,
                        currentPeriodEnd: billing.currentPeriodEnd
                    }
                }
            });

        } catch (error) {
            console.log("ERROR: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    // Obter histórico de pagamentos
    billingHistory: async (req, res, next) => {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.userId;

            // Verificar se o usuário tem acesso aos dados
            if (userId !== currentUserId && req.user.role !== 'admin') {
                throw new ForbiddenError('Você não tem permissão para acessar estes dados');
            }

            // Buscar faturas do usuário
            const billing = await Billing.findOne({
                where: { institutionId: userId },
                include: [{
                    model: Invoice,
                    as: 'invoices',
                    order: [['createdAt', 'DESC']],
                    limit: 50
                }]
            });

            if (!billing || !billing.invoices || billing.invoices.length === 0) {
                return res.json({
                    success: true,
                    data: []
                });
            }

            // Formatar histórico de pagamentos
            const paymentHistory = billing.invoices.map(invoice => ({
                id: invoice.invoiceId,
                date: invoice.createdAt.toLocaleDateString('pt-BR'),
                description: `Fatura ${invoice.externalId}`,
                amount: `R$ ${invoice.amount.toFixed(2)}`,
                status: invoice.status === 'paid' ? 'Pago' : 
                       invoice.status === 'open' ? 'Pendente' : 
                       invoice.status === 'void' ? 'Cancelado' : 'Rascunho'
            }));

            res.json({
                success: true,
                data: paymentHistory
            });

        } catch (error) {
            console.log("ERROR: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    // Adicionar método de pagamento
    addPaymentMethod: async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { paymentMethodData } = req.body;

            // Por implementar: lógica de adição de método de pagamento
            // Integrar com gateway de pagamento (Stripe, Pagar.me, etc.)

            res.json({
                success: true,
                message: 'Método de pagamento adicionado com sucesso',
                data: {
                    id: 'new-method-id',
                    last4: '4242',
                    brand: 'visa',
                    expiry: '12/25',
                    isDefault: true
                }
            });

        } catch (error) {
            console.log("ERROR: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    // Remover método de pagamento
    removePaymentMethod: async (req, res, next) => {
        try {
            const { userId, methodId } = req.params;

            // Buscar billing do usuário
            const billing = await Billing.findOne({
                where: { 
                    institutionId: userId,
                    billingId: methodId
                }
            });

            if (!billing) {
                throw new NotFoundError('Método de pagamento não encontrado');
            }

            // Remover dados do cartão
            await billing.update({
                paymentMethod: null,
                cardLast4: null
            });

            res.json({
                success: true,
                message: 'Método de pagamento removido com sucesso'
            });

        } catch (error) {
            console.log("ERROR: ", error instanceof Error ? error.message : error);
            next(error);
        }
    }
};