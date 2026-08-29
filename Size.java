import java.sql.*;
public class Size {
  public static void main(String[] a) throws Exception {
    try (Connection c = DriverManager.getConnection(a[0], a[1], a[2]); Statement s = c.createStatement()) {
      ResultSet r = s.executeQuery("select pg_database_size(current_database())");
      r.next();
      long b = r.getLong(1);
      System.out.printf("전체: %,d 바이트 = %.3f MB → 화면에는 %.1f MB%n", b, b/1048576.0, b/1048576.0);
      r = s.executeQuery(
        "select sum(pg_total_relation_size(c.oid)) from pg_class c "
        + "join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'");
      r.next();
      long mine = r.getLong(1);
      System.out.printf("내 테이블: %,d 바이트 = %.2f MB%n", mine, mine/1048576.0);
      System.out.printf("시스템 카탈로그 등: %,d 바이트 = %.2f MB%n", b-mine, (b-mine)/1048576.0);
    }
  }
}
