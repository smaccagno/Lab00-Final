Map<String, Schema.SObjectField> mapF = Schema.getGlobalDescribe().get('Tipo_Visita__c').getDescribe().fields.getMap();
System.debug('Tipo_Visita__c field type: ' + mapF.get('Tipo_Visita__c').getDescribe().getType());
System.debug('Is nillable: ' + mapF.get('Tipo_Visita__c').getDescribe().isNillable());