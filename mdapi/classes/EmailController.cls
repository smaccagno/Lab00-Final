/**
 * @description       : Email Controller
 * @author            : Seidor
**/
public without sharing class EmailController {

    private static final String TYPE_INSERT = 'insert';
    private static final String TYPE_BUY = 'buy';
    private static final String TYPE_UPDATE = 'update';
    private static final String TYPE_PAYMENT = 'payment';
    private static final String TEMPLATE_BUY = 'BuyTicket';
    private static final String TEMPLATE_INSERT = 'InsertTicket';
    private static final String TEMPLATE_UPDATE = 'UpdateTicket';
    private static final String TEMPLATE_PAYMENT = 'Payment';

    /**
    * @description Generate Structure code
    * @return String 
    **/
    @InvocableMethod(label='Invia Email')
    public static void sendEmails(List<FlowInput> inputs) {
        List<TicketAvailability__c> insertInput = new List<TicketAvailability__c>();
        List<TicketAvailability__c> buyInput = new List<TicketAvailability__c>();
        List<TicketAvailability__c> updateInput = new List<TicketAvailability__c>();
        List<Payment__c> paymentInput = new List<Payment__c>();

        try {
            for (FlowInput input : inputs) {
                if (input.type.equals(TYPE_INSERT)) {
                    insertInput.addAll(input.tickets);
                } else if (input.type.equals(TYPE_BUY)) {
                    buyInput.addAll(input.tickets);
                } else if (input.type.equals(TYPE_UPDATE)) {
                    updateInput.addAll(input.tickets);
                } else if (input.type.equals(TYPE_PAYMENT)) {
                    paymentInput.addAll(input.payments);
                }
            }
    
            if (!insertInput.isEmpty()) { sendInsertEmails(insertInput); }
            if (!buyInput.isEmpty()) { sendBuyEmails(buyInput); }
            if (!updateInput.isEmpty()) { sendUpdateEmails(updateInput); }
            if (!paymentInput.isEmpty()) { sendPaymentEmails(paymentInput); }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, '[EmailController]::[sendEmails]::[Message]: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, '[EmailController]::[sendEmails]::[Stack]: ' + e.getStackTraceString());
        }
    }

    public class FlowInput {
        @InvocableVariable(label='Tipologia' description='Valori accettati: insert, buy, update, payment' required=true)
        public String type;

        @InvocableVariable(label='Offerte' description='Lista di TicketAvailability__c - Obbligatorio per tipologia: insert, buy, update')
        public List<TicketAvailability__c> tickets;

        @InvocableVariable(label='Pagamenti' description='Lista di Pagamenti - Obbligatorio per tipologia: payment')
        public List<Payment__c> payments;
    }

    /**
    * @description Send insert emails
    * @param tickets : List<TicketAvailability__c>
    **/
    private static void sendInsertEmails(List<TicketAvailability__c> tickets) {
        Set<Id> ticketIds = new Set<Id>();

        for (TicketAvailability__c ticket : tickets) {
            ticketIds.add(ticket.Id);
        }

        tickets = getTickets(ticketIds);

        EmailTemplate template = getEmailTemplate(TEMPLATE_INSERT);
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        List<ProgramEnrollment> partners = getPartners();
        String baseUrl = getBaseUrl();

        for (User user : getUsers(partners)) {
            if (String.isNotBlank(user.Email)) {
                for (TicketAvailability__c ticket : tickets) {
                    Messaging.SingleEmailMessage email = new  Messaging.SingleEmailMessage();
                    String body = template.HtmlValue;

                    String type = ticket.TicketType__c.equals('Biglietto') ? 'bigliett' : 'abbonament';
                    type += ticket.NumberUses__c > 1 ? 'i ' : 'o ';
                    type += ticket.TicketType__c.equals('Biglietto') ? ('per ' + ticket.Show__r.Name + ' del ' + ticket.Show__r.Datetime__c.format()) : (String.isNotBlank(ticket.SubscriptionName__c) ? ticket.SubscriptionName__c : '');
                    type += ' con codice ' + ticket.Name;

                    body = body.replace('{{partner}}', user.CompanyName)
                               .replace('{{quantity}}', String.valueOf(ticket.NumberUses__c))
                               .replace('{{type}}', type)
                               .replace('{{structure}}', ticket.Structure__r.Name)
                               .replace('{{expireDate}}', ticket.OfferExpirationDate__c.format())
                               .replace('{{baseUrl}}', baseUrl);
                    
                    email.setOrgWideEmailAddressId(getOrgWideEmailAddressId());
                    email.setToAddresses(new String[]{user.Email});
                    email.setSubject(template.Subject);
                    email.setHtmlBody(body);

                    emails.add(email);
                }
            }
        }

        if(!Test.isRunningTest()) { Messaging.sendEmail(emails); }
    }

    /**
    * @description Send buy emails
    * @param tickets : List<TicketAvailability__c>
    **/
    private static void sendBuyEmails(List<TicketAvailability__c> tickets) {
        Set<Id> ticketIds = new Set<Id>();

        for (TicketAvailability__c ticket : tickets) {
            ticketIds.add(ticket.Id);
        }

        tickets = getTickets(ticketIds);

        EmailTemplate template = getEmailTemplate(TEMPLATE_BUY);
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        for (TicketAvailability__c ticket : tickets) {
            Messaging.SingleEmailMessage email = new  Messaging.SingleEmailMessage();
            String body = template.HtmlValue;

            body = body.replace('{{structure}}', ticket.Structure__r.Name)
                       .replace('{{ticketType}}',ticket.TicketType__c)
                       .replace('{{offerType}}', ticket.State__c)
                       .replace('{{ticketName}}', ticket.Name)
                       .replace('{{partner}}', ticket.Partner__r.Name)
                       .replace('{{phone}}', ticket.Partner__r.Phone)
                       .replace('{{email}}', ticket.Partner__r.Email__c)
                       .replace('{{other}}', ticket.State__c.equals('Prenotato') ? '<p>Si prega di contattare l\'ente per finalizzare la prenotazione e/o il pagamento.</p>' : '');
            
            email.setOrgWideEmailAddressId(getOrgWideEmailAddressId());
            email.setToAddresses(new String[]{ticket.Structure__r.Email__c});
            email.setSubject(template.Subject);
            email.setHtmlBody(body);

            emails.add(email);
        }

        if(!Test.isRunningTest()) { Messaging.sendEmail(emails); }
    }

    /**
    * @description Send update emails
    * @param tickets : List<TicketAvailability__c>
    **/
    private static void sendUpdateEmails(List<TicketAvailability__c> tickets) {
        Set<Id> ticketIds = new Set<Id>();

        for (TicketAvailability__c ticket : tickets) {
            ticketIds.add(ticket.Id);
        }

        tickets = getTickets(ticketIds);

        EmailTemplate template = getEmailTemplate(TEMPLATE_UPDATE);
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        List<ProgramEnrollment> partners = getPartners();
        String baseUrl = getBaseUrl();

        for (User user : getUsers(partners)) {
            if (String.isNotBlank(user.Email)) {
                for (TicketAvailability__c ticket : tickets) {
                    Messaging.SingleEmailMessage email = new  Messaging.SingleEmailMessage();
                    String body = template.HtmlValue;

                    body = body.replace('{{partner}}', user.CompanyName)
                               .replace('{{desc}}', ticket.Name)
                               .replace('{{structure}}', ticket.Structure__r.Name)
                               .replace('{{baseUrl}}', baseUrl);
                    
                    email.setOrgWideEmailAddressId(getOrgWideEmailAddressId());
                    email.setToAddresses(new String[]{user.Email});
                    email.setSubject(template.Subject);
                    email.setHtmlBody(body);

                    emails.add(email);
                }
            }
        }

        if(!Test.isRunningTest()) { Messaging.sendEmail(emails); }
    }

    /**
    * @description Send payment emails
    * @param payments : List<Payment__c>
    **/
    private static void sendPaymentEmails(List<Payment__c> payments) {
        Set<Id> paymentIds = new Set<Id>();

        for (Payment__c payment : payments) {
            paymentIds.add(payment.Id);
        }

        payments = getPayments(paymentIds);

        if (payments.isEmpty()) { return; }

        Set<String> partners = new Set<String>();
        for (Payment__c payment : payments) {
            if (payment.Budget__r != null && payment.Budget__r.Partner__r != null) {
                partners.add(payment.Budget__r.Partner__r.Name);
            }
        }
        
        Map<String,User> users = new Map<String,User>();
        for (User user : getUsers(partners)) {
            users.put(user.CompanyName, user);
        }

        EmailTemplate template = getEmailTemplate(TEMPLATE_PAYMENT);
        if (template == null) {
            System.debug(LoggingLevel.ERROR, '[EmailController] Missing EmailTemplate with DeveloperName=' + TEMPLATE_PAYMENT);
            return;
        }
        List<Messaging.SingleEmailMessage> emails = new List<Messaging.SingleEmailMessage>();

        String baseUrl = getBaseUrl();
        
        for (Payment__c payment : payments) {
            Messaging.SingleEmailMessage email = new  Messaging.SingleEmailMessage();
            String body = template.HtmlValue;

            // Resolve recipient and partner name with fallbacks
            String partnerName = (payment.Budget__r != null && payment.Budget__r.Partner__r != null)
                ? payment.Budget__r.Partner__r.Name : null;
            User user = (partnerName != null) ? users.get(partnerName) : null;
            String toAddress = (user != null && String.isNotBlank(user.Email))
                ? user.Email
                : ((payment.Budget__r != null && payment.Budget__r.Partner__r != null)
                    ? payment.Budget__r.Partner__r.Email__c
                    : null);

            if (String.isBlank(partnerName) || String.isBlank(toAddress)) {
                System.debug(LoggingLevel.WARN, '[EmailController] Skipping payment email due to missing partner/to: paymentId=' + payment.Id);
                continue;
            }

            String dateStr = (payment.Data_di_Pagamento__c != null)
                ? payment.Data_di_Pagamento__c.format()
                : Date.today().format();

            body = body.replace('{{partner}}', partnerName)
                        .replace('{{date}}', dateStr)
                        .replace('{{amount}}', String.valueOf(payment.Amount__c));
            
            Id orgWideId = getOrgWideEmailAddressId();
            if (orgWideId != null) {
                email.setOrgWideEmailAddressId(orgWideId);
            }
            email.setToAddresses(new String[]{toAddress});
            email.setSubject(template.Subject);
            email.setHtmlBody(body);

            emails.add(email);
        }

        if(!Test.isRunningTest()) { Messaging.sendEmail(emails); }
    }

    /**
    * @description Get Users
    * @param partners : List<ProgramEnrollment>
    * @return List<User>
    **/
    private static List<User> getUsers(List<ProgramEnrollment> partners){
        Set<String> names = new Set<String>();

        for (ProgramEnrollment partner : partners) {
            names.add(partner.Account.Name);
        }

        return getUsers(names);
    }

    /**
    * @description Get email template from specific name 
    * @param emailTemplateName : String 
    * @return EmailTemplate 
    **/
    private static EmailTemplate getEmailTemplate(String emailTemplateName){
        List<EmailTemplate> ts = [SELECT Id, HtmlValue, Body, Subject 
                                     FROM EmailTemplate 
                                    WHERE DeveloperName = :emailTemplateName 
                                     WITH SYSTEM_MODE 
                                    LIMIT 1];
        return ts.isEmpty() ? null : ts[0];
    }

    /**
    * @description Get tickets
    * @param ticketIds : Set<Id>
    * @return List<TicketAvailability__c> 
    **/
    private static List<TicketAvailability__c> getTickets(Set<Id> ticketIds){
        return [SELECT Id, Name, TicketType__c, State__c, Structure__r.Name, Structure__r.Email__c, Partner__r.Name, 
                       NumberUses__c, Show__r.Name, Show__r.Datetime__c, SubscriptionName__c, Partner__r.Email__c, Partner__r.Phone, OfferExpirationDate__c
                  FROM TicketAvailability__c 
                 WHERE Id IN :ticketIds 
                  WITH SYSTEM_MODE];
    }

    /**
    * @description Get payments
    * @param paymentIds : Set<Id>
    * @return List<Payment__c> 
    **/
    private static List<Payment__c> getPayments(Set<Id> paymentIds){
        return [SELECT Id, Amount__c, Data_di_Pagamento__c, Budget__r.Partner__r.Name, Budget__r.Partner__r.Email__c
                  FROM Payment__c 
                 WHERE Id IN :paymentIds 
                  WITH SYSTEM_MODE];
    }

    /**
    * @description Get Partners
    * @return List<ProgramEnrollment>
    **/
    private static List<ProgramEnrollment> getPartners(){
        return [SELECT Account.Name 
                  FROM ProgramEnrollment 
                 WHERE Program.Name = :ProgramEnrollmentService.SORRISO_SOSPESO
                   AND Account.RecordType.DeveloperName = 'Partner' 
                  WITH SYSTEM_MODE];
    }

    /**
    * @description Get users
    * @param names : Set<String>
    * @return List<User> 
    **/
    private static List<User> getUsers(Set<String> names){
        return [SELECT CompanyName, Email FROM User WHERE CompanyName IN :names WITH SYSTEM_MODE];
    }

    /**
    * @description Get OrgWideEmailAddress Id
    * @return Id 
    **/
    private static Id getOrgWideEmailAddressId() {
        List<OrgWideEmailAddress> ow = [SELECT Id FROM OrgWideEmailAddress WITH SYSTEM_MODE LIMIT 1];
        return ow.isEmpty() ? null : ow[0].Id;
    }

    /**
    * @description Get base url
    * @return String 
    **/
    private static String getBaseUrl(){
        return URL.getOrgDomainURL().toExternalForm();
    }
}