-- 02-base-media-share.sql
-- Tabelas e policies da aplicação, sem depender de auth.users existir no init.

-- Garante que gen_random_uuid funcione mesmo se search_path não pegou
-- (você pode chamar extensions.gen_random_uuid() diretamente também)
DO $$
BEGIN
  -- no-op: apenas para deixar claro o motivo do pgcrypto no schema extensions
END$$;

-- ========== PROFILES ==========
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  username text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies idempotentes (cria só se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Profiles are viewable by everyone'
  ) THEN
    EXECUTE 'CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can update their own profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can insert their own profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id)';
  END IF;
END
$$;

-- ========== CATEGORIES ==========
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='categories' AND policyname='Categories are viewable by everyone'
  ) THEN
    EXECUTE 'CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='categories' AND policyname='Authenticated users can create categories'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can create categories" ON public.categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)';
  END IF;
END
$$;

-- ========== MEDIA ==========
CREATE TABLE IF NOT EXISTS public.media (
  id uuid NOT NULL DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL, -- (sem FK no init; pode adicionar depois se quiser)
  title text NOT NULL,
  description text,
  media_type text NOT NULL CHECK (media_type IN ('photo','video')),
  source_type text NOT NULL CHECK (source_type IN ('file','url')),
  file_path text,
  external_url text,
  thumbnail_url text,
  tags jsonb DEFAULT '[]'::jsonb,
  category_id uuid REFERENCES public.categories(id),
  view_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='media' AND policyname='Media is viewable by everyone'
  ) THEN
    EXECUTE 'CREATE POLICY "Media is viewable by everyone" ON public.media FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='media' AND policyname='Users can create their own media'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can create their own media" ON public.media FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='media' AND policyname='Users can update their own media'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update their own media" ON public.media FOR UPDATE USING (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='media' AND policyname='Users can delete their own media'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete their own media" ON public.media FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END
$$;

-- ========== updated_at trigger helper ==========
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at') THEN
    EXECUTE 'CREATE TRIGGER update_profiles_updated_at
             BEFORE UPDATE ON public.profiles
             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_media_updated_at') THEN
    EXECUTE 'CREATE TRIGGER update_media_updated_at
             BEFORE UPDATE ON public.media
             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END
$$;

-- ========== STORAGE: bucket + policies ==========
-- Assume que storage.buckets e storage.objects existirão quando o storage-api subir.
-- Se ainda não existirem no init, esse bloco não pode falhar: então fazemos guardas.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='storage' AND table_name='buckets'
  ) THEN
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('media', 'media', true)
      ON CONFLICT (id) DO NOTHING
    $q$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='storage' AND table_name='objects'
  ) THEN
    -- Habilite RLS, se quiser controlar via policies
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname='Media files are publicly accessible'
    ) THEN
      EXECUTE 'CREATE POLICY "Media files are publicly accessible"
               ON storage.objects FOR SELECT
               USING (bucket_id = ''media'')';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload media'
    ) THEN
      EXECUTE 'CREATE POLICY "Authenticated users can upload media"
               ON storage.objects FOR INSERT
               WITH CHECK (bucket_id = ''media'' AND auth.uid() IS NOT NULL)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update their own media files'
    ) THEN
      EXECUTE 'CREATE POLICY "Users can update their own media files"
               ON storage.objects FOR UPDATE
               USING (bucket_id = ''media'' AND auth.uid()::text = (storage.foldername(name))[1])';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their own media files'
    ) THEN
      EXECUTE 'CREATE POLICY "Users can delete their own media files"
               ON storage.objects FOR DELETE
               USING (bucket_id = ''media'' AND auth.uid()::text = (storage.foldername(name))[1])';
    END IF;
  END IF;
END
$$;

-- ========== DEFAULT CATEGORIES ==========
INSERT INTO public.categories (name, description)
VALUES
  ('Natureza', 'Fotos e vídeos da natureza'),
  ('Arquitetura', 'Construções e design arquitetônico'),
  ('Pessoas', 'Retratos e fotos de pessoas'),
  ('Animais', 'Fauna e vida selvagem'),
  ('Arte', 'Arte e criações artísticas'),
  ('Viagens', 'Destinos e experiências de viagem'),
  ('Tecnologia', 'Gadgets e inovações'),
  ('Outros', 'Outras categorias')
ON CONFLICT (name) DO NOTHING;
