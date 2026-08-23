// טיפוסים ידניים תואמים ל-supabase/migrations/*.sql.
// TODO: להחליף בקובץ המיוצר אוטומטית לאחר קישור לפרויקט Supabase:
//   supabase gen types typescript --project-id <id> > lib/supabase/types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "therapist" | "admin";
export type UserStatus = "active" | "suspended" | "archived";
export type RoomType = "talk" | "touch" | "podcast" | "group";
export type BookingSource = "punch_card" | "session" | "admin_comp";
export type BookingStatus =
  | "confirmed"
  | "cancelled_by_user"
  | "cancelled_by_admin"
  | "completed"
  | "no_show";
export type SubStatus =
  | "requested"
  | "rejected"
  | "awaiting_payment"
  | "active"
  | "pending_cancellation"
  | "cancelled"
  | "expired";
export type PaymentType =
  | "punch_card"
  | "session_initial"
  | "session_recurring"
  | "overrun"
  | "deposit_topup";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PaymentMethod = "credit_card" | "bit" | "paybox" | "cash" | "other";
export type OverrunSource = "deposit" | "charge";

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: { key: string; value: Json; updated_at: string | null };
        Insert: { key: string; value: Json; updated_at?: string | null };
        Update: { key?: string; value?: Json; updated_at?: string | null };
        Relationships: [];
      };
      availability_events: {
        Row: {
          id: number;
          room_id: string;
          starts_at: string;
          ends_at: string;
          kind: "booked" | "blocked";
          action: "insert" | "delete";
          created_at: string;
        };
        Insert: {
          id?: number;
          room_id: string;
          starts_at: string;
          ends_at: string;
          kind: "booked" | "blocked";
          action: "insert" | "delete";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["availability_events"]["Insert"]>;
        Relationships: [];
      };
      branches: {
        Row: {
          id: string;
          name: string;
          address: string;
          waze_url: string | null;
          phone: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          waze_url?: string | null;
          phone?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
      Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          room_type: RoomType;
          capacity: number;
          description: string | null;
          equipment: Json;
          images: string[];
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          name: string;
          room_type?: RoomType;
          capacity?: number;
          description?: string | null;
          equipment?: Json;
          images?: string[];
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>;
      Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          status: UserStatus;
          full_name: string;
          phone: string;
          email: string;
          national_id: string | null;
          profession: string | null;
          business_number: string | null;
          door_code: string | null;
          terms_accepted_at: string | null;
          terms_version: string | null;
          payplus_token_uid: string | null;
          card_last4: string | null;
          card_expiry: string | null;
          ics_token: string;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          status?: UserStatus;
          full_name: string;
          phone: string;
          email: string;
          national_id?: string | null;
          profession?: string | null;
          business_number?: string | null;
          door_code?: string | null;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          payplus_token_uid?: string | null;
          card_last4?: string | null;
          card_expiry?: string | null;
          ics_token?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      therapist_admin_notes: {
        Row: {
          user_id: string;
          note: string | null;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          user_id: string;
          note?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["therapist_admin_notes"]["Insert"]>;
        Relationships: [];
      };
      punch_card_tiers: {
        Row: {
          id: string;
          hours: number;
          price_per_hour: number;
          deposit_hours: number;
          active: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          hours: number;
          price_per_hour: number;
          deposit_hours?: number;
          active?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["punch_card_tiers"]["Insert"]>;
      Relationships: [];
      };
      punch_cards: {
        Row: {
          id: string;
          user_id: string;
          tier_id: string | null;
          hours_purchased: number;
          hours_remaining: number;
          price_per_hour: number;
          deposit_amount: number;
          deposit_remaining: number;
          purchased_at: string;
          expires_at: string;
          active: boolean;
          low_balance_notified_at: string | null;
          expiry_notified_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          tier_id?: string | null;
          hours_purchased: number;
          hours_remaining: number;
          price_per_hour: number;
          deposit_amount: number;
          deposit_remaining: number;
          purchased_at?: string;
          expires_at: string;
          active?: boolean;
          low_balance_notified_at?: string | null;
          expiry_notified_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["punch_cards"]["Insert"]>;
        Relationships: [];
      };
      session_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          status: SubStatus;
          weekly_hours: number;
          monthly_price: number;
          hold_expires_at: string | null;
          requested_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          start_date: string | null;
          next_billing_date: string | null;
          cancel_requested_at: string | null;
          effective_end_date: string | null;
          renewal_reminder_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: SubStatus;
          weekly_hours: number;
          monthly_price: number;
          hold_expires_at?: string | null;
          requested_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          start_date?: string | null;
          next_billing_date?: string | null;
          cancel_requested_at?: string | null;
          effective_end_date?: string | null;
          renewal_reminder_sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_subscriptions"]["Insert"]>;
      Relationships: [];
      };
      session_slots: {
        Row: {
          id: string;
          subscription_id: string;
          room_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
        };
        Insert: {
          id?: string;
          subscription_id: string;
          room_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_slots"]["Insert"]>;
      Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          user_id: string;
          room_id: string;
          source: BookingSource;
          punch_card_id: string | null;
          subscription_id: string | null;
          starts_at: string;
          ends_at: string;
          hours_charged: number;
          status: BookingStatus;
          cancelled_at: string | null;
          cancelled_by: string | null;
          hours_refunded: boolean;
          admin_note: string | null;
          created_at: string;
          reminder_sent_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          room_id: string;
          source: BookingSource;
          punch_card_id?: string | null;
          subscription_id?: string | null;
          starts_at: string;
          ends_at: string;
          hours_charged: number;
          status?: BookingStatus;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          hours_refunded?: boolean;
          admin_note?: string | null;
          created_at?: string;
          reminder_sent_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
        Relationships: [];
      };
      room_blocks: {
        Row: {
          id: string;
          room_id: string;
          starts_at: string;
          ends_at: string;
          reason: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          starts_at: string;
          ends_at: string;
          reason: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["room_blocks"]["Insert"]>;
      Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          type: PaymentType;
          status: PaymentStatus;
          method: PaymentMethod | null;
          amount_before_vat: number;
          vat_amount: number;
          amount_total: number;
          payplus_page_uid: string | null;
          payplus_transaction_uid: string | null;
          invoice_url: string | null;
          punch_card_id: string | null;
          subscription_id: string | null;
          failure_reason: string | null;
          retry_count: number;
          created_at: string;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: PaymentType;
          status?: PaymentStatus;
          method?: PaymentMethod | null;
          amount_before_vat: number;
          vat_amount: number;
          amount_total: number;
          payplus_page_uid?: string | null;
          payplus_transaction_uid?: string | null;
          invoice_url?: string | null;
          punch_card_id?: string | null;
          subscription_id?: string | null;
          failure_reason?: string | null;
          retry_count?: number;
          created_at?: string;
          paid_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
      Relationships: [];
      };
      overrun_charges: {
        Row: {
          id: string;
          user_id: string;
          booking_id: string | null;
          minutes: number;
          hours_charged: number;
          amount: number;
          source: OverrunSource;
          payment_id: string | null;
          note: string | null;
          recorded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          booking_id?: string | null;
          minutes: number;
          hours_charged: number;
          amount: number;
          source: OverrunSource;
          payment_id?: string | null;
          note?: string | null;
          recorded_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["overrun_charges"]["Insert"]>;
      Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          user_id: string;
          branch_id: string | null;
          room_id: string | null;
          date: string;
          start_time: string;
          end_time: string;
          notified_at: string | null;
          fulfilled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          branch_id?: string | null;
          room_id?: string | null;
          date: string;
          start_time: string;
          end_time: string;
          notified_at?: string | null;
          fulfilled?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["waitlist"]["Insert"]>;
      Relationships: [];
      };
      woo_product_tiers: {
        Row: {
          woo_product_id: number;
          tier_id: string;
          created_at: string;
        };
        Insert: {
          woo_product_id: number;
          tier_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["woo_product_tiers"]["Insert"]>;
        Relationships: [];
      };
      woo_pending_purchases: {
        Row: {
          id: string;
          woo_order_id: number;
          tier_id: string;
          phone: string | null;
          email: string | null;
          quantity: number;
          amount_total: number;
          status: "pending" | "claimed" | "expired";
          claimed_by: string | null;
          claimed_at: string | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          woo_order_id: number;
          tier_id: string;
          phone?: string | null;
          email?: string | null;
          quantity?: number;
          amount_total: number;
          status?: "pending" | "claimed" | "expired";
          claimed_by?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["woo_pending_purchases"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      public_availability: {
        Row: {
          room_id: string;
          starts_at: string;
          ends_at: string;
          kind: "booked" | "blocked";
        };
        Relationships: [];
      };
    };
    Functions: {
      create_booking: {
        Args: { p_room_id: string; p_starts_at: string; p_ends_at: string };
        Returns: { booking_id: string; hours_charged: number; hours_remaining: number }[];
      };
      cancel_booking: {
        Args: { p_booking_id: string };
        Returns: { hours_refunded: boolean }[];
      };
      request_session: {
        Args: { p_slots: Json };
        Returns: { subscription_id: string; weekly_hours: number; monthly_price: number }[];
      };
      approve_session: {
        Args: { p_subscription_id: string };
        Returns: undefined;
      };
      reject_session: {
        Args: { p_subscription_id: string; p_reason: string };
        Returns: undefined;
      };
      create_session_initial_payment: {
        Args: { p_subscription_id: string };
        Returns: { payment_id: string; amount_total: number }[];
      };
      admin_activate_session_cash_payment: {
        Args: { p_payment_id: string; p_method: PaymentMethod; p_transaction_uid: string };
        Returns: undefined;
      };
      admin_mark_session_recurring_paid_cash: {
        Args: { p_payment_id: string; p_method: PaymentMethod; p_transaction_uid: string };
        Returns: undefined;
      };
      activate_session_payment: {
        Args: {
          p_payment_id: string;
          p_transaction_uid: string;
          p_method: PaymentMethod;
          p_token_uid?: string | null;
          p_card_last4?: string | null;
          p_card_expiry?: string | null;
          p_invoice_url?: string | null;
        };
        Returns: undefined;
      };
      request_subscription_cancellation: {
        Args: { p_subscription_id: string };
        Returns: { effective_end_date: string }[];
      };
      materialize_session_bookings: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      initiate_session_renewal_payment: {
        Args: { p_subscription_id: string };
        Returns: { payment_id: string; amount_total: number }[];
      };
      finalize_session_renewal: {
        Args: {
          p_payment_id: string;
          p_success: boolean;
          p_transaction_uid?: string | null;
          p_invoice_url?: string | null;
          p_reason?: string | null;
          p_method?: PaymentMethod | null;
        };
        Returns: undefined;
      };
      expire_session_holds_and_cancellations: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      preview_overrun: {
        Args: { p_booking_id: string; p_minutes: number };
        Returns: {
          hours: number;
          price_per_hour: number;
          amount: number;
          deposit_available: number;
          needs_charge: boolean;
        }[];
      };
      record_overrun: {
        Args: { p_booking_id: string; p_minutes: number; p_note: string };
        Returns: {
          overrun_id: string;
          amount: number;
          source: OverrunSource;
          payment_id: string | null;
        }[];
      };
      finalize_overrun_charge: {
        Args: {
          p_payment_id: string;
          p_success: boolean;
          p_transaction_uid?: string | null;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      admin_complete_deposit: {
        Args: { p_punch_card_id: string };
        Returns: undefined;
      };
      grant_bonus_hours: {
        Args: { p_user_id: string; p_hours: number; p_note: string };
        Returns: { punch_card_id: string }[];
      };
      admin_cancel_booking: {
        Args: { p_booking_id: string; p_refund_hours?: boolean };
        Returns: undefined;
      };
      admin_create_booking: {
        Args: {
          p_user_id: string;
          p_room_id: string;
          p_starts_at: string;
          p_ends_at: string;
          p_note?: string | null;
        };
        Returns: { booking_id: string }[];
      };
      admin_adjust_punch_card_hours: {
        Args: { p_card_id: string; p_hours_delta: number; p_note: string };
        Returns: undefined;
      };
      claim_woo_pending_purchase: {
        Args: Record<string, never>;
        Returns: { claimed_count: number; hours_granted: number }[];
      };
      admin_add_session_slot: {
        Args: {
          p_subscription_id: string;
          p_room_id: string;
          p_weekday: number;
          p_start_time: string;
          p_end_time: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      room_type: RoomType;
      booking_source: BookingSource;
      booking_status: BookingStatus;
      sub_status: SubStatus;
      payment_type: PaymentType;
      payment_status: PaymentStatus;
      payment_method: PaymentMethod;
      overrun_source: OverrunSource;
    };
  };
};
