-- =====================================================================
-- TRAINING OS AI — migration de sécurité
--  * rôle applicatif sans privilège + droits minimaux
--  * Row Level Security (isolation stricte par centre)
--  * clés étrangères composites (un centre ne peut jamais référencer
--    une ligne d'un autre centre, même en connaissant son identifiant)
--  * contraintes métier et journaux immuables
--  * fonction publique de vérification des certificats (champs limités)
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trainingos_app') THEN
    CREATE ROLE trainingos_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on' $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO trainingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trainingos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trainingos_app;
GRANT EXECUTE ON FUNCTION app_current_org(), app_current_user(), app_bypass_rls() TO trainingos_app;
-- Journaux immuables : ni modification ni suppression par l'application
REVOKE UPDATE, DELETE ON audit_logs FROM trainingos_app;
REVOKE UPDATE, DELETE ON certificate_verifications FROM trainingos_app;
REVOKE DELETE ON payments FROM trainingos_app;
REVOKE DELETE ON ai_usage FROM trainingos_app;
-- La table de suivi des migrations n'est pas accessible à l'application
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'drizzle') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM trainingos_app';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscriptions" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "org_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_counters" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "org_counters" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "instructors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instructors" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "instructors" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "students" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "courses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "courses" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "course_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_modules" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "course_modules" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "course_recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_recommendations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "course_recommendations" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "course_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "course_sessions" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "session_meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_meetings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "session_meetings" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "enrollments" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "payment_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_schedules" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_schedules" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payments" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attendance" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assessments" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "assessment_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_results" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assessment_results" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "progress" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "progress" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "materials" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "materials" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "material_chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "material_chunks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "material_chunks" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "certificates" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "certificate_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificate_verifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "certificate_verifications" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "prospects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospects" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "prospects" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "message_templates" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "communications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "communications" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tasks" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_conversations" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_messages" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_usage" FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY org_self ON organizations FOR SELECT USING (app_bypass_rls() OR id = app_current_org());
CREATE POLICY org_self_update ON organizations FOR UPDATE USING (app_bypass_rls() OR id = app_current_org()) WITH CHECK (app_bypass_rls() OR id = app_current_org());
CREATE POLICY org_admin_write ON organizations FOR INSERT WITH CHECK (app_bypass_rls());
CREATE POLICY org_admin_delete ON organizations FOR DELETE USING (app_bypass_rls());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_isolation ON users FOR ALL
  USING (app_bypass_rls() OR organization_id = app_current_org() OR id = app_current_user())
  WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_logs FOR SELECT USING (app_bypass_rls() OR organization_id = app_current_org());
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (app_bypass_rls() OR organization_id = app_current_org());

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans FORCE ROW LEVEL SECURITY;
CREATE POLICY plans_read ON plans FOR SELECT USING (true);
CREATE POLICY plans_write ON plans FOR INSERT WITH CHECK (app_bypass_rls());
CREATE POLICY plans_update ON plans FOR UPDATE USING (app_bypass_rls()) WITH CHECK (app_bypass_rls());
CREATE POLICY plans_delete ON plans FOR DELETE USING (app_bypass_rls());
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "courses" ADD CONSTRAINT "courses_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "materials" ADD CONSTRAINT "materials_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "session_meetings" ADD CONSTRAINT "session_meetings_org_id_uq" UNIQUE (organization_id, id);
ALTER TABLE "students" ADD CONSTRAINT "students_org_id_uq" UNIQUE (organization_id, id);
--> statement-breakpoint
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_same_org_fk" FOREIGN KEY (organization_id, course_id) REFERENCES "courses" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "course_recommendations" ADD CONSTRAINT "course_recommendations_from_course_id_same_org_fk" FOREIGN KEY (organization_id, from_course_id) REFERENCES "courses" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "course_recommendations" ADD CONSTRAINT "course_recommendations_to_course_id_same_org_fk" FOREIGN KEY (organization_id, to_course_id) REFERENCES "courses" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_course_id_same_org_fk" FOREIGN KEY (organization_id, course_id) REFERENCES "courses" (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_instructor_id_same_org_fk" FOREIGN KEY (organization_id, instructor_id) REFERENCES "instructors" (organization_id, id) ON DELETE NO ACTION;
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_same_org_fk" FOREIGN KEY (organization_id, instructor_id) REFERENCES "instructors" (organization_id, id) ON DELETE NO ACTION;
ALTER TABLE "session_meetings" ADD CONSTRAINT "session_meetings_session_id_same_org_fk" FOREIGN KEY (organization_id, session_id) REFERENCES "course_sessions" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_same_org_fk" FOREIGN KEY (organization_id, student_id) REFERENCES "students" (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_session_id_same_org_fk" FOREIGN KEY (organization_id, session_id) REFERENCES "course_sessions" (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_same_org_fk" FOREIGN KEY (organization_id, course_id) REFERENCES "courses" (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_enrollment_id_same_org_fk" FOREIGN KEY (organization_id, enrollment_id) REFERENCES "enrollments" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrollment_id_same_org_fk" FOREIGN KEY (organization_id, enrollment_id) REFERENCES "enrollments" (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_meeting_id_same_org_fk" FOREIGN KEY (organization_id, meeting_id) REFERENCES "session_meetings" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_enrollment_id_same_org_fk" FOREIGN KEY (organization_id, enrollment_id) REFERENCES "enrollments" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_id_same_org_fk" FOREIGN KEY (organization_id, course_id) REFERENCES "courses" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_same_org_fk" FOREIGN KEY (organization_id, assessment_id) REFERENCES "assessments" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_enrollment_id_same_org_fk" FOREIGN KEY (organization_id, enrollment_id) REFERENCES "enrollments" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "progress" ADD CONSTRAINT "progress_enrollment_id_same_org_fk" FOREIGN KEY (organization_id, enrollment_id) REFERENCES "enrollments" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "progress" ADD CONSTRAINT "progress_module_id_same_org_fk" FOREIGN KEY (organization_id, module_id) REFERENCES "course_modules" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "materials" ADD CONSTRAINT "materials_course_id_same_org_fk" FOREIGN KEY (organization_id, course_id) REFERENCES "courses" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_material_id_same_org_fk" FOREIGN KEY (organization_id, material_id) REFERENCES "materials" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollment_id_same_org_fk" FOREIGN KEY (organization_id, enrollment_id) REFERENCES "enrollments" (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_student_id_same_org_fk" FOREIGN KEY (organization_id, student_id) REFERENCES "students" (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_same_org_fk" FOREIGN KEY (organization_id, course_id) REFERENCES "courses" (organization_id, id) ON DELETE RESTRICT;
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_desired_course_id_same_org_fk" FOREIGN KEY (organization_id, desired_course_id) REFERENCES "courses" (organization_id, id) ON DELETE NO ACTION;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_student_id_same_org_fk" FOREIGN KEY (organization_id, student_id) REFERENCES "students" (organization_id, id) ON DELETE CASCADE;
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_same_org_fk" FOREIGN KEY (organization_id, conversation_id) REFERENCES "ai_conversations" (organization_id, id) ON DELETE CASCADE;
--> statement-breakpoint
-- Contraintes métier
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
ALTER TABLE payment_schedules ADD CONSTRAINT schedules_amount_positive CHECK (amount > 0);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_price_non_negative CHECK (agreed_price >= 0 AND discount >= 0 AND discount <= agreed_price);
ALTER TABLE courses ADD CONSTRAINT courses_price_non_negative CHECK (price >= 0);
ALTER TABLE courses ADD CONSTRAINT courses_weights_total CHECK (weight_attendance + weight_modules + weight_assessments = 100 AND weight_attendance >= 0 AND weight_modules >= 0 AND weight_assessments >= 0);
ALTER TABLE courses ADD CONSTRAINT courses_cert_thresholds CHECK (cert_min_attendance BETWEEN 0 AND 100 AND cert_min_grade BETWEEN 0 AND 100);
ALTER TABLE course_sessions ADD CONSTRAINT sessions_dates CHECK (end_date >= start_date);
ALTER TABLE course_sessions ADD CONSTRAINT sessions_capacity CHECK (capacity > 0);
ALTER TABLE progress ADD CONSTRAINT progress_percent_range CHECK (percent BETWEEN 0 AND 100);
ALTER TABLE assessments ADD CONSTRAINT assessments_scores CHECK (max_score > 0 AND pass_score >= 0 AND pass_score <= max_score);
ALTER TABLE assessment_results ADD CONSTRAINT results_score_non_negative CHECK (score >= 0);
ALTER TABLE course_recommendations ADD CONSTRAINT reco_not_self CHECK (from_course_id <> to_course_id);
--> statement-breakpoint
-- Un paiement enregistré est immuable : seule l'annulation (tracée) est permise.
CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount <> OLD.amount OR NEW.enrollment_id <> OLD.enrollment_id OR NEW.paid_at <> OLD.paid_at
     OR NEW.method <> OLD.method OR NEW.organization_id <> OLD.organization_id
     OR coalesce(NEW.reference, '') <> coalesce(OLD.reference, '') THEN
    RAISE EXCEPTION 'Un paiement enregistré ne peut pas être modifié ; annulez-le puis ressaisissez-le.';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Un paiement annulé ne peut pas être réactivé.';
  END IF;
  IF NEW.status = 'cancelled' AND (NEW.cancel_reason IS NULL OR length(trim(NEW.cancel_reason)) = 0) THEN
    RAISE EXCEPTION 'Un motif d''annulation est obligatoire.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payments_guard();
--> statement-breakpoint
-- Vérification publique d'un certificat : ne renvoie QUE les champs autorisés (§41).
CREATE OR REPLACE FUNCTION verify_certificate(p_code text, p_ip_hash text)
RETURNS TABLE (
  code text, status certificate_status, student_name text, course_name text,
  organization_name text, duration_hours integer, completion_date date,
  issued_at timestamptz, revoked_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prev text := coalesce(current_setting('app.bypass_rls', true), '');
  c certificates%ROWTYPE;
BEGIN
  PERFORM set_config('app.bypass_rls', 'on', true);
  SELECT * INTO c FROM certificates WHERE certificates.code = upper(trim(p_code)) LIMIT 1;
  IF FOUND THEN
    INSERT INTO certificate_verifications (organization_id, certificate_id, ip_hash)
    VALUES (c.organization_id, c.id, p_ip_hash);
    code := c.code; status := c.status; student_name := c.student_name; course_name := c.course_name;
    organization_name := c.organization_name; duration_hours := c.duration_hours;
    completion_date := c.completion_date; issued_at := c.issued_at; revoked_at := c.revoked_at;
    PERFORM set_config('app.bypass_rls', prev, true);
    RETURN NEXT;
  ELSE
    PERFORM set_config('app.bypass_rls', prev, true);
  END IF;
  RETURN;
END $$;
REVOKE ALL ON FUNCTION verify_certificate(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_certificate(text, text) TO trainingos_app;
--> statement-breakpoint
-- Droits par défaut pour les futures tables créées par le propriétaire
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trainingos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO trainingos_app;
