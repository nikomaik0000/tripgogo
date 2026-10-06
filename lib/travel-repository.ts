import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { TgFlightRow, TgHotelStayRow, TgProfileRow, TgTransportationRow, TgTravelItemRow, TgTripInvitationRow, TgTripMemberRow, TgTripResourceRow, TgTripRow } from "@/lib/database.types";
import { mapFlight, mapHotelStay, mapItem, mapTransportation, mapTrip, mapTripResource } from "@/lib/travel-mappers";
import { getTravelItemImageExtensionFromPath, getTravelItemImageFormat } from "@/lib/travel-item-image";
import type { Flight, HotelStay, Transportation, TransportationInput, TravelItem, Trip, TripEditor, TripInvitation, TripResource, TripRole } from "@/lib/types";

const RESOURCE_IMAGE_BUCKET = "tg-trip-resources";
const RESOURCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const RESOURCE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const TRAVEL_ITEM_IMAGE_BUCKET = "tg-travel-item-images";
const TRAVEL_ITEM_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

function result<T>(data: T | null, error: PostgrestError | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase did not return the requested data");
  return data;
}

async function uploadTravelItemImage(tripId: string, file: File, itemId?: string) {
  const format = getTravelItemImageFormat(file.type);
  if (!format) throw new Error("圖片必須先轉換為 WebP 或 JPEG 格式");
  if (file.size > TRAVEL_ITEM_IMAGE_MAX_BYTES) throw new Error("圖片大小不可超過 2 MB");
  const path = `${tripId}/${itemId ? `${itemId}/` : ""}${crypto.randomUUID()}.${format.extension}`;
  const { error } = await createClient().storage.from(TRAVEL_ITEM_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "31536000", contentType: file.type, upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

async function removeTravelItemImages(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await createClient().storage.from(TRAVEL_ITEM_IMAGE_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

function cleanupMessage(action: string, error: unknown) {
  return `${action}，但圖片清理未完成，可能留下 orphan object：${error instanceof Error ? error.message : String(error)}`;
}

async function copyTravelItemImage(sourcePath: string, destinationTripId: string, destinationItemId: string) {
  const supabase = createClient();
  const extension = getTravelItemImageExtensionFromPath(sourcePath);
  const destinationPath = `${destinationTripId}/${destinationItemId}/${crypto.randomUUID()}.${extension}`;
  let imageCopied = false;
  try {
    const { error: copyError } = await supabase.storage.from(TRAVEL_ITEM_IMAGE_BUCKET).copy(sourcePath, destinationPath);
    if (copyError) throw new Error(copyError.message);
    imageCopied = true;
    const { data, error: attachError } = await supabase.from("tg_travel_items")
      .update({ image_path: destinationPath }).eq("id", destinationItemId).is("image_path", null).select().single();
    return mapItem(result(data, attachError) as TgTravelItemRow);
  } catch (cause) {
    const cleanupIssues: string[] = [];
    if (imageCopied) {
      try {
        await removeTravelItemImages([destinationPath]);
      } catch (cleanupError) {
        cleanupIssues.push(`無法刪除複本圖片：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
    }
    const reason = cause instanceof Error ? cause.message : String(cause);
    const cleanup = cleanupIssues.length > 0 ? `；圖片補償清理不完整：${cleanupIssues.join("；")}` : "；已完成圖片補償清理";
    throw new Error(`${reason}${cleanup}`);
  }
}

async function removeIncompleteTravelItem(itemId: string) {
  const { error } = await createClient().from("tg_travel_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}

export const travelRepository = {
  async getTrips() {
    const { data, error } = await createClient().from("tg_trips").select("*").order("start_date");
    return result(data, error).map((row: unknown) => mapTrip(row as TgTripRow));
  },

  async getTrip(tripId: string) {
    const { data, error } = await createClient().from("tg_trips").select("*").eq("id", tripId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapTrip(data as TgTripRow) : undefined;
  },

  async getTripRole(tripId: string): Promise<TripRole | undefined> {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return undefined;
    const { data, error } = await supabase.from("tg_trip_members").select("role").eq("trip_id", tripId).eq("user_id", authData.user.id).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.role as TripRole | undefined;
  },

  async getTripRoles() {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return new Map<string, TripRole>();
    const { data, error } = await supabase.from("tg_trip_members").select("trip_id, role").eq("user_id", authData.user.id);
    return new Map<string, TripRole>(result(data, error).map((row: { trip_id: string; role: string }) => [row.trip_id, row.role as TripRole]));
  },

  async getEditableTrips() {
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);
    if (!authData.user) return [];
    const { data: profileData, error: profileError } = await supabase.from("tg_profiles")
      .select("platform_role").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    let query = supabase.from("tg_trips").select("*").eq("mode", "trip").order("start_date");
    if (profileData?.platform_role !== "admin") {
      const { data: membershipData, error: membershipError } = await supabase.from("tg_trip_members")
        .select("trip_id").eq("user_id", authData.user.id);
      if (membershipError) throw new Error(membershipError.message);
      const tripIds = membershipData.map((membership: { trip_id: string }) => membership.trip_id);
      if (tripIds.length === 0) return [];
      query = query.in("id", tripIds);
    }
    const { data, error } = await query;
    return result(data, error).map((row: unknown) => mapTrip(row as TgTripRow));
  },

  async getTripEditors(tripId: string): Promise<TripEditor[]> {
    const supabase = createClient();
    const { data: memberData, error: memberError } = await supabase.from("tg_trip_members")
      .select("user_id, created_at").eq("trip_id", tripId).eq("role", "editor").order("created_at");
    const members = result(memberData, memberError) as Pick<TgTripMemberRow, "user_id" | "created_at">[];
    if (members.length === 0) return [];
    const { data: profileData, error: profileError } = await supabase.from("tg_profiles")
      .select("id, email, display_name").in("id", members.map((member) => member.user_id));
    const profiles = new Map((result(profileData, profileError) as Pick<TgProfileRow, "id" | "email" | "display_name">[])
      .map((profile) => [profile.id, profile]));
    return members.flatMap((member) => {
      const profile = profiles.get(member.user_id);
      return profile ? [{ userId: member.user_id, email: profile.email, displayName: profile.display_name ?? undefined, createdAt: member.created_at }] : [];
    });
  },

  async getTripPendingInvitations(tripId: string): Promise<TripInvitation[]> {
    const { data, error } = await createClient().from("tg_trip_invitations").select("*")
      .eq("trip_id", tripId).is("accepted_at", null).order("created_at");
    return (result(data, error) as TgTripInvitationRow[]).map(mapInvitation);
  },

  async getMyPendingInvitations(): Promise<TripInvitation[]> {
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);
    const email = authData.user?.email?.trim().toLowerCase();
    if (!email) return [];
    const { data, error } = await supabase.from("tg_trip_invitations").select("*")
      .eq("email", email).is("accepted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at");
    const invitations = (result(data, error) as TgTripInvitationRow[]).map(mapInvitation);
    if (invitations.length === 0) return [];
    const { data: tripData, error: tripError } = await supabase.from("tg_trips").select("id, name")
      .in("id", invitations.map((invitation) => invitation.tripId));
    const names = new Map<string, string>(result(tripData, tripError).map((trip: { id: string; name: string }) => [trip.id, trip.name]));
    return invitations.map((invitation) => ({ ...invitation, tripName: names.get(invitation.tripId) }));
  },

  async inviteTripEditor(tripId: string, email: string) {
    const { error } = await createClient().rpc("tg_invite_trip_member", {
      p_trip_id: tripId, p_email: email, p_expires_at: null,
    });
    if (error) throw new Error(error.message);
  },

  async acceptTripInvitation(invitationId: string) {
    const { data, error } = await createClient().rpc("tg_accept_trip_invitation", { p_invitation_id: invitationId });
    return result(data, error) as string;
  },

  async revokeTripInvitation(invitationId: string) {
    const { error } = await createClient().rpc("tg_revoke_trip_invitation", { p_invitation_id: invitationId });
    if (error) throw new Error(error.message);
  },

  async removeTripEditor(tripId: string, userId: string) {
    const { error } = await createClient().rpc("tg_remove_trip_editor", { p_trip_id: tripId, p_user_id: userId });
    if (error) throw new Error(error.message);
  },

  async saveTrip(input: Pick<Trip, "name" | "mode" | "startDate" | "endDate"> & { id?: string; ownerId?: string; isPublic?: boolean }) {
    const supabase = createClient();
    if (input.id) {
      const { data, error } = await supabase.from("tg_trips").update({
        name: input.name, mode: input.mode, start_date: input.startDate, end_date: input.endDate,
      }).eq("id", input.id).select().single();
      return mapTrip(result(data, error) as TgTripRow);
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("請先登入再新增旅行");
    const { data, error } = await supabase.from("tg_trips").insert({
      owner_id: authData.user.id, name: input.name, mode: input.mode, start_date: input.startDate, end_date: input.endDate,
      is_public: input.isPublic ?? true,
    }).select().single();
    return mapTrip(result(data, error) as TgTripRow);
  },

  async setTripVisibility(tripId: string, isPublic: boolean) {
    const { error } = await createClient().rpc("tg_set_trip_visibility", {
      p_trip_id: tripId, p_is_public: isPublic,
    });
    if (error) throw new Error(error.message);
  },

  async duplicateTrip(tripId: string) {
    const supabase = createClient();
    const { data: sourceData, error: sourceError } = await supabase.from("tg_travel_items")
      .select("id, image_path").eq("trip_id", tripId);
    const sourceItems = result(sourceData, sourceError) as Pick<TgTravelItemRow, "id" | "image_path">[];
    const { data, error } = await supabase.rpc("tg_duplicate_trip", { p_trip_id: tripId });
    const newTripId = result(data, error) as string;
    const copiedPaths: string[] = [];

    try {
      const { data: destinationData, error: destinationError } = await supabase.from("tg_travel_items")
        .select("id, duplicate_source_item_id").eq("trip_id", newTripId).not("duplicate_source_item_id", "is", null);
      const destinationItems = result(destinationData, destinationError) as Pick<TgTravelItemRow, "id" | "duplicate_source_item_id">[];
      const destinationsBySource = new Map(destinationItems.map((item) => [item.duplicate_source_item_id, item.id]));
      if (destinationItems.length !== sourceItems.length || destinationsBySource.size !== sourceItems.length || sourceItems.some((item) => !destinationsBySource.has(item.id))) {
        throw new Error("複製項目的 lineage 對應不完整");
      }

      for (const source of sourceItems) {
        if (!source.image_path) continue;
        const destinationItemId = destinationsBySource.get(source.id);
        if (!destinationItemId) throw new Error(`找不到來源項目 ${source.id} 的複本`);
        const extension = getTravelItemImageExtensionFromPath(source.image_path);
        const destinationPath = `${newTripId}/${destinationItemId}/${crypto.randomUUID()}.${extension}`;
        const { error: copyError } = await supabase.storage.from(TRAVEL_ITEM_IMAGE_BUCKET)
          .copy(source.image_path, destinationPath);
        if (copyError) throw new Error(copyError.message);
        copiedPaths.push(destinationPath);
        const { error: attachError } = await supabase.from("tg_travel_items")
          .update({ image_path: destinationPath }).eq("id", destinationItemId).is("image_path", null).select("id").single();
        if (attachError) throw new Error(attachError.message);
      }

      const { data: clearedLineageData, error: clearLineageError } = await supabase.from("tg_travel_items")
        .update({ duplicate_source_item_id: null }).eq("trip_id", newTripId).not("duplicate_source_item_id", "is", null).select("id");
      if (clearLineageError) throw new Error(clearLineageError.message);
      if (clearedLineageData.length !== destinationItems.length) throw new Error("duplicate lineage 未完全清除");
      return newTripId;
    } catch (cause) {
      const cleanupIssues: string[] = [];
      if (copiedPaths.length > 0) {
        const { error: clearReferencesError } = await supabase.from("tg_travel_items")
          .update({ image_path: null }).eq("trip_id", newTripId).in("image_path", copiedPaths);
        if (clearReferencesError) cleanupIssues.push(`無法清除 destination DB 圖片參照：${clearReferencesError.message}`);
        try {
          await removeTravelItemImages(copiedPaths);
        } catch (cleanupError) {
          cleanupIssues.push(`無法刪除 destination Storage objects：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
      }
      const { error: deleteTripError } = await supabase.from("tg_trips").delete().eq("id", newTripId);
      if (deleteTripError) cleanupIssues.push(`無法刪除未完成的 duplicate trip：${deleteTripError.message}`);
      const reason = cause instanceof Error ? cause.message : String(cause);
      const cleanup = cleanupIssues.length > 0 ? `；補償清理不完整：${cleanupIssues.join("；")}` : "；已完成補償清理";
      throw new Error(`複製旅行圖片失敗：${reason}${cleanup}`);
    }
  },

  async deleteTrip(tripId: string) {
    const { error } = await createClient().from("tg_trips").delete().eq("id", tripId);
    if (error) throw new Error(error.message);
  },

  async getItems(tripId: string) {
    const { data, error } = await createClient().from("tg_travel_items").select("*").eq("trip_id", tripId).order("sort_order");
    return result(data, error).map((row: unknown) => mapItem(row as TgTravelItemRow));
  },

  async saveItem(input: Omit<TravelItem, "id" | "createdAt" | "updatedAt" | "order"> & { id?: string }, imageFile?: File) {
    const supabase = createClient();
    let sortOrder: number | undefined;
    let previousImagePath: string | undefined;
    if (input.id) {
      const { data: existing, error } = await supabase.from("tg_travel_items").select("date, sort_order, image_path").eq("id", input.id).single();
      if (error) throw new Error(error.message);
      if (existing.date === input.date) sortOrder = existing.sort_order;
      previousImagePath = existing.image_path ?? undefined;
    }
    if (sortOrder === undefined) {
      let lastQuery = supabase.from("tg_travel_items").select("sort_order").eq("trip_id", input.tripId);
      lastQuery = input.date ? lastQuery.eq("date", input.date) : lastQuery.is("date", null);
      const { data: last, error } = await lastQuery.order("sort_order", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      sortOrder = (last?.sort_order ?? -1) + 1;
    }
    let uploadedPath: string | undefined;
    if (imageFile) uploadedPath = await uploadTravelItemImage(input.tripId, imageFile, input.id);
    const nextImagePath = uploadedPath ?? input.imagePath ?? null;
    const values = {
      trip_id: input.tripId, type: input.type, category: input.category, area: input.area,
      date: input.date, name: input.name, google_maps_url: input.googleMapsUrl,
      extra_link_1: input.extraLink1 ?? null, extra_link_2: input.extraLink2 ?? null,
      business_hours: input.businessHours ?? null, note: input.note, image_path: nextImagePath,
      status: input.status, rating: input.rating, completed_date: input.completedDate,
      experience_note: input.experienceNote || null, consumed_items: input.consumedItems || null,
      image_fit: input.imageFit, sort_order: sortOrder,
    };
    let saved: TravelItem;
    try {
      if (input.id) {
        const { data, error } = await supabase.from("tg_travel_items").update(values).eq("id", input.id).select().single();
        saved = mapItem(result(data, error) as TgTravelItemRow);
      } else {
        const { data, error } = await supabase.from("tg_travel_items").insert(values).select().single();
        saved = mapItem(result(data, error) as TgTravelItemRow);
      }
    } catch (saveError) {
      if (!uploadedPath) throw saveError;
      try {
        await removeTravelItemImages([uploadedPath]);
      } catch (cleanupError) {
        throw new Error(`${saveError instanceof Error ? saveError.message : String(saveError)}；${cleanupMessage("資料未儲存", cleanupError)}`);
      }
      throw saveError;
    }
    let cleanupWarning: string | undefined;
    if (previousImagePath && previousImagePath !== nextImagePath) {
      try {
        await removeTravelItemImages([previousImagePath]);
      } catch (cleanupError) {
        cleanupWarning = cleanupMessage("資料已儲存", cleanupError);
      }
    }
    return { item: saved, cleanupWarning };
  },

  async duplicateItem(itemId: string) {
    const supabase = createClient();
    const { data: sourceData, error: sourceError } = await supabase.from("tg_travel_items").select("*").eq("id", itemId).single();
    const source = result(sourceData, sourceError) as TgTravelItemRow;
    const { data: tripData, error: tripError } = await supabase.from("tg_trips").select("mode").eq("id", source.trip_id).single();
    const tripMode = (result(tripData, tripError) as Pick<TgTripRow, "mode">).mode ?? "trip";
    let lastQuery = supabase.from("tg_travel_items").select("sort_order").eq("trip_id", source.trip_id);
    lastQuery = source.date ? lastQuery.eq("date", source.date) : lastQuery.is("date", null);
    const { data: lastData, error: lastError } = await lastQuery.order("sort_order", { ascending: false }).limit(1).maybeSingle();
    if (lastError) throw new Error(lastError.message);
    const { data: destinationData, error: destinationError } = await supabase.from("tg_travel_items").insert({
      trip_id: source.trip_id,
      type: source.type,
      category: source.category,
      area: source.area,
      date: tripMode === "collection" ? null : source.date,
      name: source.name,
      google_maps_url: source.google_maps_url,
      extra_link_1: source.extra_link_1,
      extra_link_2: source.extra_link_2,
      business_hours: source.business_hours,
      note: source.note,
      image_path: null,
      status: tripMode === "collection" ? source.status : null,
      rating: source.rating,
      completed_date: tripMode === "collection" ? source.completed_date : null,
      experience_note: source.experience_note,
      consumed_items: source.consumed_items,
      image_fit: source.image_fit,
      sort_order: (lastData?.sort_order ?? -1) + 1,
    }).select().single();
    const destination = result(destinationData, destinationError) as TgTravelItemRow;
    if (!source.image_path) return mapItem(destination);

    try {
      return await copyTravelItemImage(source.image_path, source.trip_id, destination.id);
    } catch (cause) {
      const cleanupIssues: string[] = [];
      try {
        await removeIncompleteTravelItem(destination.id);
      } catch (cleanupError) {
        cleanupIssues.push(`無法刪除複本資料：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
      const reason = cause instanceof Error ? cause.message : String(cause);
      const cleanup = cleanupIssues.length > 0 ? `；補償清理不完整：${cleanupIssues.join("；")}` : "；已完成補償清理";
      throw new Error(`複製項目圖片失敗：${reason}${cleanup}`);
    }
  },

  async addCollectionItemToTrip(source: TravelItem, targetTripId: string, targetDate: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("tg_add_collection_item_to_trip", {
      p_source_item_id: source.id,
      p_target_trip_id: targetTripId,
      p_target_date: targetDate,
    });
    const destinationItemId = result(data, error) as string;
    if (!source.imagePath) return destinationItemId;
    try {
      await copyTravelItemImage(source.imagePath, targetTripId, destinationItemId);
      return destinationItemId;
    } catch (cause) {
      const cleanupIssues: string[] = [];
      try {
        await removeIncompleteTravelItem(destinationItemId);
      } catch (cleanupError) {
        cleanupIssues.push(`無法刪除未完成的旅程項目：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
      const reason = cause instanceof Error ? cause.message : String(cause);
      const cleanup = cleanupIssues.length > 0 ? `；補償清理不完整：${cleanupIssues.join("；")}` : "；已完成補償清理";
      throw new Error(`加入旅程圖片失敗：${reason}${cleanup}`);
    }
  },

  async updateItemStatus(itemId: string, status: NonNullable<TravelItem["status"]>) {
    const { data, error } = await createClient().from("tg_travel_items")
      .update({ status }).eq("id", itemId).select().single();
    return mapItem(result(data, error) as TgTravelItemRow);
  },

  async deleteItem(itemId: string) {
    const supabase = createClient();
    const { data, error: readError } = await supabase.from("tg_travel_items").select("image_path").eq("id", itemId).single();
    if (readError) throw new Error(readError.message);
    const imagePath = (data as Pick<TgTravelItemRow, "image_path">).image_path;
    const { error } = await supabase.from("tg_travel_items").delete().eq("id", itemId);
    if (error) throw new Error(error.message);
    if (!imagePath) return {};
    try {
      await removeTravelItemImages([imagePath]);
      return {};
    } catch (cleanupError) {
      return { cleanupWarning: cleanupMessage("項目已刪除", cleanupError) };
    }
  },

  async getTravelItemImageUrl(path: string) {
    const { data, error } = await createClient().storage.from(TRAVEL_ITEM_IMAGE_BUCKET).createSignedUrl(path, 60 * 60);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  async getTripResources(tripId: string) {
    const { data, error } = await createClient().from("tg_trip_resources").select("*")
      .eq("trip_id", tripId).order("created_at", { ascending: false });
    return result(data, error).map((row: unknown) => mapTripResource(row as TgTripResourceRow));
  },

  async saveTripResource(input: Pick<TripResource, "tripId" | "category" | "title" | "note" | "externalUrl" | "imagePath"> & { id?: string }) {
    const values = {
      trip_id: input.tripId, category: input.category, title: input.title,
      note: input.note ?? null, external_url: input.externalUrl ?? null,
      image_path: input.imagePath ?? null,
    };
    const query = input.id
      ? createClient().from("tg_trip_resources").update(values).eq("id", input.id)
      : createClient().from("tg_trip_resources").insert(values);
    const { data, error } = await query.select().single();
    return mapTripResource(result(data, error) as TgTripResourceRow);
  },

  async deleteTripResource(resourceId: string) {
    const { error } = await createClient().from("tg_trip_resources").delete().eq("id", resourceId);
    if (error) throw new Error(error.message);
  },

  async uploadTripResourceImage(tripId: string, file: File) {
    if (!RESOURCE_IMAGE_TYPES.has(file.type)) throw new Error("圖片格式僅支援 JPG、PNG、WebP 或 GIF");
    if (file.size > RESOURCE_IMAGE_MAX_BYTES) throw new Error("圖片大小不可超過 10 MB");
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "image";
    const path = `${tripId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await createClient().storage.from(RESOURCE_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "31536000", contentType: file.type, upsert: false,
    });
    if (error) throw new Error(error.message);
    return path;
  },

  async getTripResourceImageUrl(path: string) {
    const { data, error } = await createClient().storage.from(RESOURCE_IMAGE_BUCKET).createSignedUrl(path, 60 * 60);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  async reorderItems(tripId: string, date: string, orderedIds: string[]) {
    const { error } = await createClient().rpc("tg_reorder_travel_items", {
      p_trip_id: tripId, p_date: date, p_ordered_ids: orderedIds,
    });
    if (error) throw new Error(error.message);
  },

  async getFlights(tripId: string) {
    const { data, error } = await createClient().from("tg_flights").select("*").eq("trip_id", tripId)
      .order("departure_date").order("departure_time");
    return result(data, error).map((row: unknown) => mapFlight(row as TgFlightRow));
  },

  async saveFlight(input: Omit<Flight, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const values = {
      trip_id: input.tripId, airline: input.airline, flight_number: input.flightNumber,
      departure_place: input.departurePlace, arrival_place: input.arrivalPlace,
      departure_date: input.departureDate, departure_time: input.departureTime,
      arrival_date: input.arrivalDate, arrival_time: input.arrivalTime,
      link: input.link ?? null, note: input.note ?? null,
    };
    const query = input.id
      ? createClient().from("tg_flights").update(values).eq("id", input.id)
      : createClient().from("tg_flights").insert(values);
    const { data, error } = await query.select().single();
    return mapFlight(result(data, error) as TgFlightRow);
  },

  async deleteFlight(flightId: string) {
    const { error } = await createClient().from("tg_flights").delete().eq("id", flightId);
    if (error) throw new Error(error.message);
  },

  async getHotelStays(tripId: string) {
    const { data, error } = await createClient().from("tg_hotel_stays").select("*").eq("trip_id", tripId).order("check_in_date");
    return result(data, error).map((row: unknown) => mapHotelStay(row as TgHotelStayRow));
  },

  async saveHotelStay(input: Omit<HotelStay, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const values = {
      trip_id: input.tripId, name: input.name, check_in_date: input.checkInDate,
      check_out_date: input.checkOutDate, check_in_time: input.checkInTime ?? null,
      check_out_time: input.checkOutTime ?? null, address: input.address ?? null,
      phone: input.phone ?? null, google_maps_url: input.googleMapsUrl ?? null,
      link: input.link ?? null, note: input.note ?? null,
    };
    const query = input.id
      ? createClient().from("tg_hotel_stays").update(values).eq("id", input.id)
      : createClient().from("tg_hotel_stays").insert(values);
    const { data, error } = await query.select().single();
    return mapHotelStay(result(data, error) as TgHotelStayRow);
  },

  async deleteHotelStay(stayId: string) {
    const { error } = await createClient().from("tg_hotel_stays").delete().eq("id", stayId);
    if (error) throw new Error(error.message);
  },

  async getTransportations(tripId: string) {
    const { data, error } = await createClient().from("tg_transportations").select("*").eq("trip_id", tripId)
      .order("start_date").order("start_time");
    return result(data, error).map((row: unknown) => mapTransportation(row as TgTransportationRow));
  },

  async saveTransportation(input: TransportationInput & { tripId: string; id?: string }) {
    const values = {
      trip_id: input.tripId, type: input.type,
      company: input.type === "rental_car" ? input.company : null,
      vehicle_model: input.type === "rental_car" ? input.vehicleModel : null,
      route_name: input.type === "rail" ? input.routeName : null,
      start_date: input.startDate, start_time: input.startTime, end_date: input.endDate, end_time: input.endTime,
      departure_place: input.departurePlace, arrival_place: input.arrivalPlace,
      train_number: input.type === "rail" ? input.trainNumber ?? null : null,
      seat: input.type === "rail" ? input.seat ?? null : null,
      carriage: input.type === "rail" ? input.carriage ?? null : null,
      ticket: input.type === "rail" ? input.ticket ?? null : null,
      reservation_number: input.reservationNumber ?? null, cost: input.cost ?? null,
      address: input.type === "rental_car" ? input.address ?? null : null,
      link: input.link ?? null,
      google_maps_url: input.type === "rental_car" ? input.googleMapsUrl ?? null : null,
      note: input.note ?? null,
    };
    const query = input.id
      ? createClient().from("tg_transportations").update(values).eq("id", input.id)
      : createClient().from("tg_transportations").insert(values);
    const { data, error } = await query.select().single();
    return mapTransportation(result(data, error) as TgTransportationRow);
  },

  async deleteTransportation(transportationId: string) {
    const { error } = await createClient().from("tg_transportations").delete().eq("id", transportationId);
    if (error) throw new Error(error.message);
  },
};

function mapInvitation(row: TgTripInvitationRow): TripInvitation {
  return {
    id: row.id,
    tripId: row.trip_id,
    email: row.email,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
  };
}
