import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1731236400000 implements MigrationInterface {
  name = 'InitialSchema1731236400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(100) NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_templates_code" UNIQUE ("code"),
        CONSTRAINT "PK_templates" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "template_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "template_id" uuid NOT NULL,
        "language" character varying(10) NOT NULL,
        "version" integer NOT NULL,
        "subject" character varying(500) NOT NULL,
        "body" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_template_versions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_template_versions_template_language_version" 
      ON "template_versions" ("template_id", "language", "version")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_template_versions_template_language_active" 
      ON "template_versions" ("template_id", "language", "is_active")
    `);

    await queryRunner.query(`
      ALTER TABLE "template_versions" 
      ADD CONSTRAINT "FK_template_versions_template" 
      FOREIGN KEY ("template_id") 
      REFERENCES "templates"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "template_versions" 
      DROP CONSTRAINT "FK_template_versions_template"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_template_versions_template_language_active"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_template_versions_template_language_version"
    `);

    await queryRunner.query(`DROP TABLE "template_versions"`);

    await queryRunner.query(`DROP TABLE "templates"`);
  }
}
