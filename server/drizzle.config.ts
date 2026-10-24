import { defineConfig } from "drizzle-kit";
// 스키마의 원본은 migrations/*.sql 이다. 이 설정은 그걸 적용한 DB에서 타입을 뽑아오는(pull) 용도뿐
export default defineConfig({
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: { url: process.env.PULL_DB ?? "" },
  out: "./drizzle-pull",
  tablesFilter: ["!flyway_schema_history"],
});
