-- Checks for 20261120120000_security_questions.sql (forgot password with a security question), on a local
-- PostgreSQL with a stand-in for what Supabase provides (roles, the auth schema, pgcrypto). Never run this on the
-- real project: it creates its own roles, schemas and users.
--
--   initdb -D pgtest -U postgres --auth=trust -E UTF8 --locale=C
--   pg_ctl -D pgtest -o "-p 54329" start
--   psql -h localhost -p 54329 -U postgres -c "create database furtest"
--   psql -h localhost -p 54329 -U postgres -d furtest -v ON_ERROR_STOP=1 -f supabase/tests/security_questions_setup.sql
--   psql -h localhost -p 54329 -U postgres -d furtest -v ON_ERROR_STOP=1 -f supabase/migrations/20261120120000_security_questions.sql
--   psql -h localhost -p 54329 -U postgres -d furtest -f supabase/tests/security_questions.sql
--   pg_ctl -D pgtest stop
--
-- Each "==" step says what should happen; the ERROR lines are the refusals it expects. Last run: 2026-11-20 on
-- PostgreSQL 18.3, all 14 steps as expected.
\pset footer off
\echo '== 1 owner, wrong password: refused'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.set_security_question('What was your childhood nickname?', 'Bo Bo', 'wrongpass');
\echo '== 2 answer too short: refused'
select public.set_security_question('What was your childhood nickname?', ' b ', 'oldpass123');
\echo '== 3 no question: refused'
select public.set_security_question('   ', 'Bo Bo', 'oldpass123');
\echo '== 4 saved; the owner sees the question'
select public.set_security_question('What was your childhood nickname?', '  Bo   Bo ', 'oldpass123');
select public.my_security_question();
\echo '== 5 the owner cannot read the table (hash)'
select * from public.security_questions;
reset role;
\echo '== 6 the demo account cannot have a question'
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.set_security_question('What was your childhood nickname?', 'Bo Bo', 'demopass1');
reset role;
\echo '== 7 not logged in: question for the email (any case, spaces); none for demo, unknown, or no question'
set role anon; set request.jwt.claim.sub = '';
select public.security_question_for('  OWNER@Example.com ') as owner, public.security_question_for('demo@furfriends.app') as demo,
       public.security_question_for('nobody@example.com') as unknown, public.security_question_for('other@example.com') as no_question;
\echo '== 8 not logged in: cannot set a question, read the table, or ask for "my" question'
select public.set_security_question('What was your childhood nickname?', 'xx', 'yy');
select * from public.security_questions;
select public.my_security_question();
\echo '== 9 resets: unknown, demo, short password, 4 wrong (4..1 left), 5th locks, right answer while locked'
select public.reset_password_with_answer('nobody@example.com', 'bo bo', 'newpass123');
select public.reset_password_with_answer('demo@furfriends.app', 'bo bo', 'newpass123');
select public.reset_password_with_answer('owner@example.com', 'bo bo', 'short');
select public.reset_password_with_answer('owner@example.com', 'wrong', 'newpass123');
select public.reset_password_with_answer('owner@example.com', 'wrong', 'newpass123');
select public.reset_password_with_answer('owner@example.com', 'wrong', 'newpass123');
select public.reset_password_with_answer('owner@example.com', 'wrong', 'newpass123');
select public.reset_password_with_answer('owner@example.com', 'wrong', 'newpass123');
select public.reset_password_with_answer('owner@example.com', 'bo bo', 'newpass123');
reset role;
\echo '== 10 the old password still works while locked'
select extensions.crypt('oldpass123', encrypted_password) = encrypted_password as old_still_works from auth.users where email = 'owner@example.com';
update public.security_questions set locked_until = now() - interval '1 second';
\echo '== 11 after the lock: right answer in other case and spacing sets the new password and ends the other sessions'
set role anon;
select public.reset_password_with_answer('Owner@example.com', '  BO  bo ', 'newpass123');
reset role;
select extensions.crypt('newpass123', encrypted_password) = encrypted_password as new_works,
       extensions.crypt('oldpass123', encrypted_password) = encrypted_password as old_works,
       encrypted_password like '$2a$10$%' as bcrypt_cost_10
from auth.users where email = 'owner@example.com';
select u.email, count(s.id) as sessions from auth.users u left join auth.sessions s on s.user_id = u.id group by u.email order by 1;
select failed_attempts, locked_until from public.security_questions;
\echo '== 12 changing the question needs the current (new) password'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.set_security_question('What was the name of your first teacher?', 'Mrs Cruz', 'oldpass123');
select public.set_security_question('What was the name of your first teacher?', 'Mrs Cruz', 'newpass123');
select public.my_security_question();
reset role;
\echo '== 13 the old answer no longer works, the new one does'
set role anon;
select public.reset_password_with_answer('owner@example.com', 'bo bo', 'another123');
select public.reset_password_with_answer('owner@example.com', 'mrs cruz', 'another123');
reset role;
\echo '== 14 deleting the account deletes its question'
delete from auth.users where email = 'owner@example.com';
select count(*) as questions_left from public.security_questions;
