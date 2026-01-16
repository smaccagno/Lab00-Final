/**
 * @description       : ProgramEnrollment Service
 * @author            : Seidor
 **/
public inherited sharing class ProgramEnrollmentService {
  public static final String TEMPO_SOSPESO = 'Tempo Sospeso';
  public static final String SORRISO_SOSPESO = 'Sorriso Sospeso';

  private static ProgramEnrollmentService instance;
  private User user;

  private ProgramEnrollmentService() {
    this.user = this.getUser();
  }

  private List<ProgramEnrollment> programEnrollments {
    get {
      if (this.programEnrollments == null) {
        this.programEnrollments = [
          SELECT Id, Program.Name
          FROM ProgramEnrollment
          WHERE Account.Name = :this.user.CompanyName AND IsActive = TRUE
          WITH SYSTEM_MODE
        ];
      }
      return this.programEnrollments;
    }
    set;
  }

  public static ProgramEnrollmentService getInstance() {
    if (instance == null) {
      instance = new ProgramEnrollmentService();
    }
    return instance;
  }

  public List<ProgramEnrollment> getProgramEnrollments() {
    return this.programEnrollments;
  }

  @AuraEnabled(cacheable=true)
  public static Boolean enabledForTempoSospeso() {
    try {
      ProgramEnrollmentService service = ProgramEnrollmentService.getInstance();
      for (
        ProgramEnrollment programEnrollment : service.getProgramEnrollments()
      ) {
        if (programEnrollment.Program.Name.equals(TEMPO_SOSPESO)) {
          return true;
        }
      }
      return false;
    } catch (Exception e) {
      throw new AuraHandledException(e.getMessage());
    }
  }

  @AuraEnabled(cacheable=true)
  public static Boolean enabledForSorrisoSospeso() {
    try {
      ProgramEnrollmentService service = ProgramEnrollmentService.getInstance();
      for (
        ProgramEnrollment programEnrollment : service.getProgramEnrollments()
      ) {
        if (programEnrollment.Program.Name.equals(SORRISO_SOSPESO)) {
          return true;
        }
      }
      return false;
    } catch (Exception e) {
      throw new AuraHandledException(e.getMessage());
    }
  }

  @AuraEnabled
  public static List<ProgramEnrollment> getEnabledPrograms() {
    try {
      return ProgramEnrollmentService.getInstance().getProgramEnrollments();
    } catch (Exception e) {
      throw new AuraHandledException(e.getMessage());
    }
  }

  private User getUser() {
    return [
      SELECT Id, CompanyName
      FROM User
      WHERE Id = :UserInfo.getUserId()
      WITH SYSTEM_MODE
      LIMIT 1
    ];
  }

  @AuraEnabled(cacheable=true)
  public static List<ProgramEnrollment> getActiveEnrollmentsByAccount(
    Id accountId
  ) {
    try {
      if (accountId == null) {
        throw new AuraHandledException('Id account non può essere null');
      }

      return [
        SELECT Id, Program.Name
        FROM ProgramEnrollment
        WHERE AccountId = :accountId AND IsActive = TRUE
        WITH SYSTEM_MODE
      ];
    } catch (Exception e) {
      throw new AuraHandledException(
        'Errore durante il recupero degli enrollment: ' + e.getMessage()
      );
    }
  }
}