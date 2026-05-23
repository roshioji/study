-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id               uuid PRIMARY KEY, -- same as auth.users.id
  display_name     text,
  role             text CHECK (role IN ('student','teacher','admin')) DEFAULT 'student',
  streak_count     int DEFAULT 0,
  streak_updated_at timestamptz,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role insert" ON users FOR INSERT WITH CHECK (true);

-- ============================================================
-- goals
-- ============================================================
CREATE TABLE goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  cycle_type  text CHECK (cycle_type IN ('weekly','biweekly','monthly')),
  title       text NOT NULL,
  pass_score  int DEFAULT 70,
  start_date  date,
  end_date    date,
  status      text CHECK (status IN ('active','completed','revised')) DEFAULT 'active',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own goals" ON goals USING (auth.uid() = user_id);

-- ============================================================
-- shared_materials (API節約のためユーザー間共有)
-- ============================================================
CREATE TABLE shared_materials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash           text UNIQUE NOT NULL,
  title               text,
  file_path           text,
  extracted_text      text,
  summary             text,
  questions_generated bool DEFAULT false,
  upload_count        int DEFAULT 1,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE shared_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read" ON shared_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert" ON shared_materials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update" ON shared_materials FOR UPDATE TO authenticated USING (true);

-- ============================================================
-- user_materials
-- ============================================================
CREATE TABLE user_materials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id) ON DELETE CASCADE,
  shared_material_id  uuid REFERENCES shared_materials(id),
  goal_id             uuid REFERENCES goals(id),
  nickname            text,
  total_attempts      int DEFAULT 0,
  avg_score           numeric DEFAULT 0,
  last_studied_at     timestamptz,
  added_at            timestamptz DEFAULT now()
);

ALTER TABLE user_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own materials" ON user_materials USING (auth.uid() = user_id);

-- ============================================================
-- questions
-- ============================================================
CREATE TABLE questions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_material_id  uuid REFERENCES shared_materials(id),
  goal_id             uuid REFERENCES goals(id),
  type                text CHECK (type IN ('short_answer','long_answer')),
  question_text       text NOT NULL,
  correct_answer      text NOT NULL,
  rubric              jsonb,
  keywords            text[],
  points              int DEFAULT 10,
  explanation         text,
  source              text CHECK (source IN ('ai_generated','manual')) DEFAULT 'ai_generated',
  difficulty          int CHECK (difficulty BETWEEN 1 AND 5) DEFAULT 3,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read questions" ON questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages questions" ON questions FOR ALL USING (true);

-- ============================================================
-- test_sessions
-- ============================================================
CREATE TABLE test_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES users(id),
  goal_id            uuid REFERENCES goals(id),
  session_type       text CHECK (session_type IN ('weekly','monthly','remedial')),
  score              int,
  passed             bool,
  restriction_active bool DEFAULT false,
  completed_at       timestamptz DEFAULT now()
);

ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sessions" ON test_sessions USING (auth.uid() = user_id);

-- ============================================================
-- test_answers
-- ============================================================
CREATE TABLE test_answers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid REFERENCES test_sessions(id),
  question_id      uuid REFERENCES questions(id),
  user_answer      text,
  ai_score         int,
  ai_feedback      text,
  missing_keywords text[],
  is_correct       bool,
  time_spent_sec   int,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE test_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own answers" ON test_answers FOR SELECT
  USING (EXISTS (SELECT 1 FROM test_sessions ts WHERE ts.id = session_id AND ts.user_id = auth.uid()));

-- ============================================================
-- material_attempts
-- ============================================================
CREATE TABLE material_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES users(id),
  user_material_id uuid REFERENCES user_materials(id),
  question_id      uuid REFERENCES questions(id),
  session_id       uuid REFERENCES test_sessions(id),
  image_path       text,
  user_answer      text,
  ai_score         int,
  ai_feedback      text,
  missing_keywords text[],
  is_correct       bool,
  attempt_count    int DEFAULT 1,
  attempted_at     timestamptz DEFAULT now()
);

ALTER TABLE material_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own attempts" ON material_attempts USING (auth.uid() = user_id);

-- ============================================================
-- material_summaries
-- ============================================================
CREATE TABLE material_summaries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES users(id),
  user_material_id     uuid REFERENCES user_materials(id),
  period_type          text CHECK (period_type IN ('weekly','monthly')),
  period_start         date,
  period_end           date,
  total_attempts       int,
  avg_score            numeric,
  weak_units           jsonb,
  frequent_missing_kw  text[],
  ai_summary_text      text,
  recommended_pages    jsonb,
  generated_at         timestamptz DEFAULT now()
);

ALTER TABLE material_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own summaries" ON material_summaries USING (auth.uid() = user_id);

-- ============================================================
-- retry_queue
-- ============================================================
CREATE TABLE retry_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id),
  question_id   uuid REFERENCES questions(id),
  priority      int DEFAULT 1,
  fail_count    int DEFAULT 1,
  next_retry_at date,
  status        text CHECK (status IN ('pending','resolved')) DEFAULT 'pending'
);

ALTER TABLE retry_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own retry queue" ON retry_queue USING (auth.uid() = user_id);

-- ============================================================
-- badges
-- ============================================================
CREATE TABLE badges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id),
  badge_type text,
  earned_at  timestamptz DEFAULT now()
);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own badges" ON badges USING (auth.uid() = user_id);

-- ============================================================
-- notification_settings
-- ============================================================
CREATE TABLE notification_settings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES users(id) UNIQUE,
  daily_reminder_time    time DEFAULT '20:00',
  test_reminder_enabled  bool DEFAULT true,
  loss_warning_enabled   bool DEFAULT true,
  push_token             text
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification settings" ON notification_settings USING (auth.uid() = user_id);

-- ============================================================
-- Helper function: increment upload_count
-- ============================================================
CREATE OR REPLACE FUNCTION increment(x int)
RETURNS int AS $$
  SELECT x + 1;
$$ LANGUAGE sql IMMUTABLE;

-- ============================================================
-- Trigger: create user profile on auth signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');

  INSERT INTO public.notification_settings (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX idx_user_materials_user_id ON user_materials(user_id);
CREATE INDEX idx_user_materials_goal_id ON user_materials(goal_id);
CREATE INDEX idx_questions_shared_material_id ON questions(shared_material_id);
CREATE INDEX idx_test_sessions_user_id ON test_sessions(user_id);
CREATE INDEX idx_material_attempts_user_id ON material_attempts(user_id);
CREATE INDEX idx_retry_queue_user_next ON retry_queue(user_id, next_retry_at) WHERE status = 'pending';
