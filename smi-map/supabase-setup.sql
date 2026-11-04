-- SMI Map: run once in Supabase → SQL Editor → New query → Run.

-- Only @learner.manipal.edu emails can create an account.
-- The website checks this too, but this rule can't be bypassed.
create or replace function public.only_smi_students()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) not like '%@learner.manipal.edu' then
    raise exception 'Only @learner.manipal.edu emails can join SMI Map';
  end if;
  return new;
end;
$$;

drop trigger if exists only_smi_students on auth.users;
create trigger only_smi_students
  before insert or update of email on auth.users
  for each row execute function public.only_smi_students();
