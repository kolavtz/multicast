-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ENUMS
CREATE TYPE job_status AS ENUM ('queued', 'processing', 'success', 'failed', 'cancelled');
CREATE TYPE account_platform AS ENUM ('youtube', 'facebook', 'instagram', 'tiktok');

-- 1. PROFILES (Users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  created_at timestamptz default now()
);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. WORKSPACES (Tenancy)
create table public.workspaces (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  owner_id uuid references public.profiles(id) not null,
  created_at timestamptz default now()
);

-- 3. WORKSPACE MEMBERS
create table public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'member', -- owner, admin, member
  primary key (workspace_id, user_id)
);

-- 4. CONNECTED ACCOUNTS
create table public.connected_accounts (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  platform account_platform not null,
  external_id text not null, -- Platform's user/page ID
  display_name text,
  username text,
  picture_url text,
  
  -- Security: Encrypted Tokens
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[], -- List of granted scopes
  
  metadata jsonb default '{}'::jsonb, -- Extra platform specific info
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. MEDIA ASSETS
create table public.media_assets (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  storage_path text not null, -- Supabase Storage path
  filename text not null,
  mime_type text,
  size_bytes bigint,
  duration_seconds int,
  created_at timestamptz default now()
);

-- 6. POSTS
create table public.posts (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  author_id uuid references public.profiles(id),
  
  title text, -- For YT
  caption text,
  video_url text, -- Helper if needed, or link to media_assets
  media_asset_id uuid references public.media_assets(id),
  
  settings jsonb default '{}'::jsonb, -- Platform specific settings (privacy, etc)
  created_at timestamptz default now()
);

-- 7. PUBLISH JOBS (The Queue)
create table public.publish_jobs (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  connected_account_id uuid references public.connected_accounts(id),
  
  status job_status default 'queued',
  scheduled_at timestamptz not null, -- When to run
  
  started_at timestamptz,
  finished_at timestamptz,
  
  attempt_count int default 0,
  last_error text,
  platform_post_id text, -- ID returned by platform
  logs jsonb default '[]'::jsonb, -- Execution logs
  
  created_at timestamptz default now()
);

-- RLS POLICIES
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.media_assets enable row level security;
alter table public.posts enable row level security;
alter table public.publish_jobs enable row level security;

-- Profiles: Users can see themselves
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Workspaces: Users can view workspaces they are members of
create policy "Users can view workspaces" on public.workspaces
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = workspaces.id
      and workspace_members.user_id = auth.uid()
    )
  );
  
create policy "Users can insert workspaces" on public.workspaces
  for insert with check (auth.uid() = owner_id);

-- Workspace Members: Viewable by members of same workspace
create policy "Members can view members" on public.workspace_members
  for select using (
    exists (
      select 1 from public.workspace_members as wm
      where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Helper function for workspace access
create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.workspace_members
    where workspace_id = _workspace_id
    and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- Generic Policies for Workspace-scoped tables
-- Connected Accounts
create policy "View workspace accounts" on public.connected_accounts
  for select using (public.is_workspace_member(workspace_id));
create policy "Manage workspace accounts" on public.connected_accounts
  for all using (public.is_workspace_member(workspace_id));

-- Media Assets
create policy "View workspace media" on public.media_assets
  for select using (public.is_workspace_member(workspace_id));
create policy "Manage workspace media" on public.media_assets
  for all using (public.is_workspace_member(workspace_id));

-- Posts
create policy "View workspace posts" on public.posts
  for select using (public.is_workspace_member(workspace_id));
create policy "Manage workspace posts" on public.posts
  for all using (public.is_workspace_member(workspace_id));

-- Jobs
create policy "View workspace jobs" on public.publish_jobs
  for select using (public.is_workspace_member(workspace_id));
