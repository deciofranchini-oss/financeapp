-- Tipos
create type public.category_type as enum ('income', 'expense');
create type public.tx_status as enum ('planned', 'cleared');

-- Contas
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);

-- Beneficiários / Fontes pagadoras
create table public.payees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'generic',
  created_at timestamptz not null default now()
);

-- Categorias (subcategorias via parent_id)
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.category_type not null,
  name text not null,
  parent_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.categories(user_id);
create index on public.categories(parent_id);

-- Transações (previsão: expected_date; efetivação: cleared_date)
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  account_id uuid not null references public.accounts(id) on delete restrict,
  payee_id uuid references public.payees(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,

  type public.category_type not null,
  description text,
  amount numeric(14,2) not null check (amount > 0),

  expected_date date not null,
  cleared_date date,
  status public.tx_status not null default 'planned',

  created_at timestamptz not null default now()
);

create index on public.transactions(user_id);
create index on public.transactions(expected_date);
create index on public.transactions(cleared_date);

-- RLS
alter table public.accounts enable row level security;
alter table public.payees enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "accounts_rw_own"
on public.accounts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "payees_rw_own"
on public.payees for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "categories_rw_own"
on public.categories for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "transactions_rw_own"
on public.transactions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
