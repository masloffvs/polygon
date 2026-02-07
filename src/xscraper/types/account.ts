export interface Root {
	success: boolean;
	username: string;
	captures: Capture[];
	duration: number;
}

export interface Capture {
	url: string;
	method: string;
	requestHeaders: RequestHeaders;
	operationName: string;
	timestamp: number;
	responseStatus: number;
	responseHeaders: ResponseHeaders;
	responseBody: ResponseBody;
}

export type RequestHeaders = {};

export type ResponseHeaders = {};

export interface ResponseBody {
	data: Data;
}

export interface Data {
	user: User;
}

export interface User {
	result: Result;
}

export interface Result {
	__typename: string;
	timeline: Timeline;
}

export interface Timeline {
	timeline: Timeline2;
}

export interface Timeline2 {
	instructions: Instruction[];
	metadata: Metadata;
}

export interface Instruction {
	type: string;
	entries?: Entry[];
	direction?: string;
}

export interface Entry {
	entryId: string;
	sortIndex: string;
	content: Content;
}

export interface Content {
	entryType: string;
	__typename: string;
	itemContent: ItemContent;
	clientEventInfo: ClientEventInfo;
}

export interface ItemContent {
	itemType: string;
	__typename: string;
	tweet_results: TweetResults;
	tweetDisplayType: string;
}

export interface TweetResults {
	result: Result2;
}

export interface Result2 {
	__typename: string;
	rest_id: string;
	core: Core;
	unmention_data: UnmentionData;
	edit_control: EditControl;
	is_translatable: boolean;
	views: Views;
	source: string;
	grok_analysis_button: boolean;
	legacy: Legacy2;
	quick_promote_eligibility: QuickPromoteEligibility;
	quoted_status_result?: QuotedStatusResult;
}

export interface Core {
	user_results: UserResults;
}

export interface UserResults {
	result: Result3;
}

export interface Result3 {
	__typename: string;
	id: string;
	rest_id: string;
	affiliates_highlighted_label: AffiliatesHighlightedLabel;
	avatar: Avatar;
	core: Core2;
	dm_permissions: DmPermissions;
	is_blue_verified: boolean;
	legacy: Legacy;
	location: Location;
	media_permissions: MediaPermissions;
	parody_commentary_fan_label: string;
	profile_image_shape: string;
	professional: Professional;
	profile_bio: ProfileBio;
	privacy: Privacy;
	relationship_perspectives: RelationshipPerspectives;
	verification: Verification;
}

export interface AffiliatesHighlightedLabel {
	label: Label;
}

export interface Label {
	url: Url;
	badge: Badge;
	description: string;
	userLabelType: string;
	userLabelDisplayType: string;
}

export interface Url {
	url: string;
	urlType: string;
}

export interface Badge {
	url: string;
}

export interface Avatar {
	image_url: string;
}

export interface Core2 {
	created_at: string;
	name: string;
	screen_name: string;
}

export type DmPermissions = {};

export interface Legacy {
	default_profile: boolean;
	default_profile_image: boolean;
	description: string;
	entities: Entities;
	fast_followers_count: number;
	favourites_count: number;
	followers_count: number;
	friends_count: number;
	has_custom_timelines: boolean;
	is_translator: boolean;
	listed_count: number;
	media_count: number;
	normal_followers_count: number;
	pinned_tweet_ids_str: any[];
	possibly_sensitive: boolean;
	profile_banner_url: string;
	profile_interstitial_type: string;
	statuses_count: number;
	translator_type: string;
	withheld_in_countries: any[];
}

export interface Entities {
	description: Description;
}

export interface Description {
	urls: any[];
}

export interface Location {
	location: string;
}

export type MediaPermissions = {};

export interface Professional {
	rest_id: string;
	professional_type: string;
	category: any[];
}

export interface ProfileBio {
	description: string;
}

export interface Privacy {
	protected: boolean;
}

export type RelationshipPerspectives = {};

export interface Verification {
	verified: boolean;
}

export type UnmentionData = {};

export interface EditControl {
	edit_tweet_ids: string[];
	editable_until_msecs: string;
	is_edit_eligible: boolean;
	edits_remaining: string;
}

export interface Views {
	state: string;
	count?: string;
}

export interface Legacy2 {
	bookmark_count: number;
	bookmarked: boolean;
	created_at: string;
	conversation_id_str: string;
	display_text_range: number[];
	entities: Entities2;
	favorite_count: number;
	favorited: boolean;
	full_text: string;
	is_quote_status: boolean;
	lang: string;
	quote_count: number;
	reply_count: number;
	retweet_count: number;
	retweeted: boolean;
	user_id_str: string;
	id_str: string;
	extended_entities?: ExtendedEntities;
	possibly_sensitive?: boolean;
	possibly_sensitive_editable?: boolean;
	quoted_status_id_str?: string;
	quoted_status_permalink?: QuotedStatusPermalink;
}

export interface Entities2 {
	hashtags: any[];
	symbols: any[];
	timestamps: any[];
	urls: any[];
	user_mentions: UserMention[];
	media?: Medum[];
}

export interface UserMention {
	id_str: string;
	name: string;
	screen_name: string;
	indices: number[];
}

export interface Medum {
	display_url: string;
	expanded_url: string;
	id_str: string;
	indices: number[];
	media_key: string;
	media_url_https: string;
	type: string;
	url: string;
	ext_media_availability: ExtMediaAvailability;
	features?: Features;
	sizes: Sizes;
	original_info: OriginalInfo;
	media_results: MediaResults;
	allow_download_status?: AllowDownloadStatus;
	additional_media_info?: AdditionalMediaInfo;
	video_info?: VideoInfo;
	source_status_id_str?: string;
	source_user_id_str?: string;
}

export interface ExtMediaAvailability {
	status: string;
}

export interface Features {
	large: Large;
	medium: Medium;
	small: Small;
	orig: Orig;
}

export interface Large {
	faces: Face[];
}

export interface Face {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Medium {
	faces: Face2[];
}

export interface Face2 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Small {
	faces: Face3[];
}

export interface Face3 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Orig {
	faces: Face4[];
}

export interface Face4 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Sizes {
	large: Large2;
	medium: Medium2;
	small: Small2;
	thumb: Thumb;
}

export interface Large2 {
	h: number;
	w: number;
	resize: string;
}

export interface Medium2 {
	h: number;
	w: number;
	resize: string;
}

export interface Small2 {
	h: number;
	w: number;
	resize: string;
}

export interface Thumb {
	h: number;
	w: number;
	resize: string;
}

export interface OriginalInfo {
	height: number;
	width: number;
	focus_rects: FocusRect[];
}

export interface FocusRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface MediaResults {
	result: Result4;
}

export interface Result4 {
	media_key: string;
}

export interface AllowDownloadStatus {
	allow_download: boolean;
}

export interface AdditionalMediaInfo {
	monetizable: boolean;
	source_user?: SourceUser;
	title?: string;
	description?: string;
	embeddable?: boolean;
}

export interface SourceUser {
	user_results: UserResults2;
}

export interface UserResults2 {
	result: Result5;
}

export interface Result5 {
	__typename: string;
	id: string;
	rest_id: string;
	affiliates_highlighted_label: AffiliatesHighlightedLabel2;
	avatar: Avatar2;
	core: Core3;
	dm_permissions: DmPermissions2;
	is_blue_verified: boolean;
	legacy: Legacy3;
	location: Location2;
	media_permissions: MediaPermissions2;
	parody_commentary_fan_label: string;
	profile_image_shape: string;
	profile_bio: ProfileBio2;
	privacy: Privacy2;
	relationship_perspectives: RelationshipPerspectives2;
	verification: Verification2;
	profile_description_language?: string;
	professional?: Professional2;
}

export interface AffiliatesHighlightedLabel2 {
	label?: Label2;
}

export interface Label2 {
	url: Url2;
	badge: Badge2;
	description: string;
	userLabelType: string;
	userLabelDisplayType: string;
}

export interface Url2 {
	url: string;
	urlType: string;
}

export interface Badge2 {
	url: string;
}

export interface Avatar2 {
	image_url: string;
}

export interface Core3 {
	created_at: string;
	name: string;
	screen_name: string;
}

export type DmPermissions2 = {};

export interface Legacy3 {
	default_profile: boolean;
	default_profile_image: boolean;
	description: string;
	entities: Entities3;
	fast_followers_count: number;
	favourites_count: number;
	followers_count: number;
	friends_count: number;
	has_custom_timelines: boolean;
	is_translator: boolean;
	listed_count: number;
	media_count: number;
	normal_followers_count: number;
	pinned_tweet_ids_str: string[];
	possibly_sensitive: boolean;
	profile_banner_url: string;
	profile_interstitial_type: string;
	statuses_count: number;
	translator_type: string;
	url?: string;
	withheld_in_countries: any[];
}

export interface Entities3 {
	description: Description2;
	url?: Url3;
}

export interface Description2 {
	urls: any[];
}

export interface Url3 {
	urls: Url4[];
}

export interface Url4 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Location2 {
	location: string;
}

export type MediaPermissions2 = {};

export interface ProfileBio2 {
	description: string;
}

export interface Privacy2 {
	protected: boolean;
}

export type RelationshipPerspectives2 = {};

export interface Verification2 {
	verified: boolean;
	verified_type?: string;
}

export interface Professional2 {
	rest_id: string;
	professional_type: string;
	category: any[];
}

export interface VideoInfo {
	aspect_ratio: number[];
	duration_millis: number;
	variants: Variant[];
}

export interface Variant {
	content_type: string;
	url: string;
	bitrate?: number;
}

export interface ExtendedEntities {
	media: Medum2[];
}

export interface Medum2 {
	display_url: string;
	expanded_url: string;
	id_str: string;
	indices: number[];
	media_key: string;
	media_url_https: string;
	type: string;
	url: string;
	ext_media_availability: ExtMediaAvailability2;
	features?: Features2;
	sizes: Sizes2;
	original_info: OriginalInfo2;
	media_results: MediaResults2;
	allow_download_status?: AllowDownloadStatus2;
	additional_media_info?: AdditionalMediaInfo2;
	video_info?: VideoInfo2;
	source_status_id_str?: string;
	source_user_id_str?: string;
}

export interface ExtMediaAvailability2 {
	status: string;
}

export interface Features2 {
	large: Large3;
	medium: Medium3;
	small: Small3;
	orig: Orig2;
}

export interface Large3 {
	faces: Face5[];
}

export interface Face5 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Medium3 {
	faces: Face6[];
}

export interface Face6 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Small3 {
	faces: Face7[];
}

export interface Face7 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Orig2 {
	faces: Face8[];
}

export interface Face8 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Sizes2 {
	large: Large4;
	medium: Medium4;
	small: Small4;
	thumb: Thumb2;
}

export interface Large4 {
	h: number;
	w: number;
	resize: string;
}

export interface Medium4 {
	h: number;
	w: number;
	resize: string;
}

export interface Small4 {
	h: number;
	w: number;
	resize: string;
}

export interface Thumb2 {
	h: number;
	w: number;
	resize: string;
}

export interface OriginalInfo2 {
	height: number;
	width: number;
	focus_rects: FocusRect2[];
}

export interface FocusRect2 {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface MediaResults2 {
	result: Result6;
}

export interface Result6 {
	media_key: string;
}

export interface AllowDownloadStatus2 {
	allow_download: boolean;
}

export interface AdditionalMediaInfo2 {
	monetizable: boolean;
	source_user?: SourceUser2;
	title?: string;
	description?: string;
	embeddable?: boolean;
}

export interface SourceUser2 {
	user_results: UserResults3;
}

export interface UserResults3 {
	result: Result7;
}

export interface Result7 {
	__typename: string;
	id: string;
	rest_id: string;
	affiliates_highlighted_label: AffiliatesHighlightedLabel3;
	avatar: Avatar3;
	core: Core4;
	dm_permissions: DmPermissions3;
	is_blue_verified: boolean;
	legacy: Legacy4;
	location: Location3;
	media_permissions: MediaPermissions3;
	parody_commentary_fan_label: string;
	profile_image_shape: string;
	profile_bio: ProfileBio3;
	privacy: Privacy3;
	relationship_perspectives: RelationshipPerspectives3;
	verification: Verification3;
	profile_description_language?: string;
	professional?: Professional3;
}

export interface AffiliatesHighlightedLabel3 {
	label?: Label3;
}

export interface Label3 {
	url: Url5;
	badge: Badge3;
	description: string;
	userLabelType: string;
	userLabelDisplayType: string;
}

export interface Url5 {
	url: string;
	urlType: string;
}

export interface Badge3 {
	url: string;
}

export interface Avatar3 {
	image_url: string;
}

export interface Core4 {
	created_at: string;
	name: string;
	screen_name: string;
}

export type DmPermissions3 = {};

export interface Legacy4 {
	default_profile: boolean;
	default_profile_image: boolean;
	description: string;
	entities: Entities4;
	fast_followers_count: number;
	favourites_count: number;
	followers_count: number;
	friends_count: number;
	has_custom_timelines: boolean;
	is_translator: boolean;
	listed_count: number;
	media_count: number;
	normal_followers_count: number;
	pinned_tweet_ids_str: string[];
	possibly_sensitive: boolean;
	profile_banner_url: string;
	profile_interstitial_type: string;
	statuses_count: number;
	translator_type: string;
	url?: string;
	withheld_in_countries: any[];
}

export interface Entities4 {
	description: Description3;
	url?: Url6;
}

export interface Description3 {
	urls: any[];
}

export interface Url6 {
	urls: Url7[];
}

export interface Url7 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Location3 {
	location: string;
}

export type MediaPermissions3 = {};

export interface ProfileBio3 {
	description: string;
}

export interface Privacy3 {
	protected: boolean;
}

export type RelationshipPerspectives3 = {};

export interface Verification3 {
	verified: boolean;
	verified_type?: string;
}

export interface Professional3 {
	rest_id: string;
	professional_type: string;
	category: any[];
}

export interface VideoInfo2 {
	aspect_ratio: number[];
	duration_millis: number;
	variants: Variant2[];
}

export interface Variant2 {
	content_type: string;
	url: string;
	bitrate?: number;
}

export interface QuotedStatusPermalink {
	url: string;
	expanded: string;
	display: string;
}

export interface QuickPromoteEligibility {
	eligibility: string;
}

export interface QuotedStatusResult {
	result: Result8;
}

export interface Result8 {
	__typename: string;
	rest_id: string;
	core: Core5;
	unmention_data: UnmentionData2;
	edit_control: EditControl2;
	is_translatable: boolean;
	views: Views2;
	source: string;
	grok_analysis_button: boolean;
	legacy: Legacy6;
	note_tweet?: NoteTweet;
	quotedRefResult?: QuotedRefResult;
}

export interface Core5 {
	user_results: UserResults4;
}

export interface UserResults4 {
	result: Result9;
}

export interface Result9 {
	__typename: string;
	id: string;
	rest_id: string;
	affiliates_highlighted_label: AffiliatesHighlightedLabel4;
	avatar: Avatar4;
	core: Core6;
	dm_permissions: DmPermissions4;
	is_blue_verified: boolean;
	legacy: Legacy5;
	location: Location4;
	media_permissions: MediaPermissions4;
	parody_commentary_fan_label: string;
	profile_image_shape: string;
	professional?: Professional4;
	profile_bio: ProfileBio4;
	privacy: Privacy4;
	relationship_perspectives: RelationshipPerspectives4;
	verification: Verification4;
	profile_description_language: string;
}

export interface AffiliatesHighlightedLabel4 {
	label?: Label4;
}

export interface Label4 {
	url: Url8;
	badge: Badge4;
	description: string;
	userLabelType: string;
	userLabelDisplayType: string;
}

export interface Url8 {
	url: string;
	urlType: string;
}

export interface Badge4 {
	url: string;
}

export interface Avatar4 {
	image_url: string;
}

export interface Core6 {
	created_at: string;
	name: string;
	screen_name: string;
}

export type DmPermissions4 = {};

export interface Legacy5 {
	default_profile: boolean;
	default_profile_image: boolean;
	description: string;
	entities: Entities5;
	fast_followers_count: number;
	favourites_count: number;
	followers_count: number;
	friends_count: number;
	has_custom_timelines: boolean;
	is_translator: boolean;
	listed_count: number;
	media_count: number;
	normal_followers_count: number;
	pinned_tweet_ids_str: string[];
	possibly_sensitive: boolean;
	profile_banner_url: string;
	profile_interstitial_type: string;
	statuses_count: number;
	translator_type: string;
	url?: string;
	withheld_in_countries: any[];
}

export interface Entities5 {
	description: Description4;
	url?: Url10;
}

export interface Description4 {
	urls: Url9[];
}

export interface Url9 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Url10 {
	urls: Url11[];
}

export interface Url11 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Location4 {
	location: string;
}

export type MediaPermissions4 = {};

export interface Professional4 {
	rest_id: string;
	professional_type: string;
	category: Category[];
}

export interface Category {
	id: number;
	name: string;
	icon_name: string;
}

export interface ProfileBio4 {
	description: string;
}

export interface Privacy4 {
	protected: boolean;
}

export type RelationshipPerspectives4 = {};

export interface Verification4 {
	verified: boolean;
	verified_type?: string;
}

export type UnmentionData2 = {};

export interface EditControl2 {
	edit_tweet_ids: string[];
	editable_until_msecs: string;
	is_edit_eligible: boolean;
	edits_remaining: string;
}

export interface Views2 {
	count: string;
	state: string;
}

export interface Legacy6 {
	bookmark_count: number;
	bookmarked: boolean;
	created_at: string;
	conversation_id_str: string;
	display_text_range: number[];
	entities: Entities6;
	extended_entities: ExtendedEntities2;
	favorite_count: number;
	favorited: boolean;
	full_text: string;
	is_quote_status: boolean;
	lang: string;
	possibly_sensitive: boolean;
	possibly_sensitive_editable: boolean;
	quote_count: number;
	reply_count: number;
	retweet_count: number;
	retweeted: boolean;
	user_id_str: string;
	id_str: string;
	quoted_status_id_str?: string;
	quoted_status_permalink?: QuotedStatusPermalink2;
}

export interface Entities6 {
	hashtags: Hashtag[];
	media: Medum3[];
	symbols: any[];
	timestamps: any[];
	urls: any[];
	user_mentions: any[];
}

export interface Hashtag {
	indices: number[];
	text: string;
}

export interface Medum3 {
	display_url: string;
	expanded_url: string;
	id_str: string;
	indices: number[];
	media_key: string;
	media_url_https: string;
	type: string;
	url: string;
	additional_media_info?: AdditionalMediaInfo3;
	ext_media_availability: ExtMediaAvailability3;
	sizes: Sizes3;
	original_info: OriginalInfo3;
	allow_download_status?: AllowDownloadStatus3;
	video_info?: VideoInfo3;
	media_results: MediaResults3;
	source_status_id_str?: string;
	source_user_id_str?: string;
	features?: Features3;
}

export interface AdditionalMediaInfo3 {
	monetizable: boolean;
	source_user?: SourceUser3;
}

export interface SourceUser3 {
	user_results: UserResults5;
}

export interface UserResults5 {
	result: Result10;
}

export interface Result10 {
	__typename: string;
	id: string;
	rest_id: string;
	affiliates_highlighted_label: AffiliatesHighlightedLabel5;
	avatar: Avatar5;
	core: Core7;
	dm_permissions: DmPermissions5;
	is_blue_verified: boolean;
	legacy: Legacy7;
	location: Location5;
	media_permissions: MediaPermissions5;
	parody_commentary_fan_label: string;
	profile_image_shape: string;
	professional: Professional5;
	profile_bio: ProfileBio5;
	privacy: Privacy5;
	relationship_perspectives: RelationshipPerspectives5;
	verification: Verification5;
	profile_description_language: string;
}

export type AffiliatesHighlightedLabel5 = {};

export interface Avatar5 {
	image_url: string;
}

export interface Core7 {
	created_at: string;
	name: string;
	screen_name: string;
}

export type DmPermissions5 = {};

export interface Legacy7 {
	default_profile: boolean;
	default_profile_image: boolean;
	description: string;
	entities: Entities7;
	fast_followers_count: number;
	favourites_count: number;
	followers_count: number;
	friends_count: number;
	has_custom_timelines: boolean;
	is_translator: boolean;
	listed_count: number;
	media_count: number;
	normal_followers_count: number;
	pinned_tweet_ids_str: any[];
	possibly_sensitive: boolean;
	profile_banner_url: string;
	profile_interstitial_type: string;
	statuses_count: number;
	translator_type: string;
	url: string;
	withheld_in_countries: any[];
}

export interface Entities7 {
	description: Description5;
	url: Url13;
}

export interface Description5 {
	urls: Url12[];
}

export interface Url12 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Url13 {
	urls: Url14[];
}

export interface Url14 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Location5 {
	location: string;
}

export type MediaPermissions5 = {};

export interface Professional5 {
	rest_id: string;
	professional_type: string;
	category: Category2[];
}

export interface Category2 {
	id: number;
	name: string;
	icon_name: string;
}

export interface ProfileBio5 {
	description: string;
}

export interface Privacy5 {
	protected: boolean;
}

export type RelationshipPerspectives5 = {};

export interface Verification5 {
	verified: boolean;
}

export interface ExtMediaAvailability3 {
	status: string;
}

export interface Sizes3 {
	large: Large5;
	medium: Medium5;
	small: Small5;
	thumb: Thumb3;
}

export interface Large5 {
	h: number;
	w: number;
	resize: string;
}

export interface Medium5 {
	h: number;
	w: number;
	resize: string;
}

export interface Small5 {
	h: number;
	w: number;
	resize: string;
}

export interface Thumb3 {
	h: number;
	w: number;
	resize: string;
}

export interface OriginalInfo3 {
	height: number;
	width: number;
	focus_rects: FocusRect3[];
}

export interface FocusRect3 {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface AllowDownloadStatus3 {
	allow_download: boolean;
}

export interface VideoInfo3 {
	aspect_ratio: number[];
	duration_millis: number;
	variants: Variant3[];
}

export interface Variant3 {
	content_type: string;
	url: string;
	bitrate?: number;
}

export interface MediaResults3 {
	result: Result11;
}

export interface Result11 {
	media_key: string;
}

export interface Features3 {
	large: Large6;
	medium: Medium6;
	small: Small6;
	orig: Orig3;
}

export interface Large6 {
	faces: Face9[];
}

export interface Face9 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Medium6 {
	faces: Face10[];
}

export interface Face10 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Small6 {
	faces: Face11[];
}

export interface Face11 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Orig3 {
	faces: Face12[];
}

export interface Face12 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface ExtendedEntities2 {
	media: Medum4[];
}

export interface Medum4 {
	display_url: string;
	expanded_url: string;
	id_str: string;
	indices: number[];
	media_key: string;
	media_url_https: string;
	type: string;
	url: string;
	additional_media_info?: AdditionalMediaInfo4;
	ext_media_availability: ExtMediaAvailability4;
	sizes: Sizes4;
	original_info: OriginalInfo4;
	allow_download_status?: AllowDownloadStatus4;
	video_info?: VideoInfo4;
	media_results: MediaResults4;
	source_status_id_str?: string;
	source_user_id_str?: string;
	features?: Features4;
}

export interface AdditionalMediaInfo4 {
	monetizable: boolean;
	source_user?: SourceUser4;
}

export interface SourceUser4 {
	user_results: UserResults6;
}

export interface UserResults6 {
	result: Result12;
}

export interface Result12 {
	__typename: string;
	id: string;
	rest_id: string;
	affiliates_highlighted_label: AffiliatesHighlightedLabel6;
	avatar: Avatar6;
	core: Core8;
	dm_permissions: DmPermissions6;
	is_blue_verified: boolean;
	legacy: Legacy8;
	location: Location6;
	media_permissions: MediaPermissions6;
	parody_commentary_fan_label: string;
	profile_image_shape: string;
	professional: Professional6;
	profile_bio: ProfileBio6;
	privacy: Privacy6;
	relationship_perspectives: RelationshipPerspectives6;
	verification: Verification6;
	profile_description_language: string;
}

export type AffiliatesHighlightedLabel6 = {};

export interface Avatar6 {
	image_url: string;
}

export interface Core8 {
	created_at: string;
	name: string;
	screen_name: string;
}

export type DmPermissions6 = {};

export interface Legacy8 {
	default_profile: boolean;
	default_profile_image: boolean;
	description: string;
	entities: Entities8;
	fast_followers_count: number;
	favourites_count: number;
	followers_count: number;
	friends_count: number;
	has_custom_timelines: boolean;
	is_translator: boolean;
	listed_count: number;
	media_count: number;
	normal_followers_count: number;
	pinned_tweet_ids_str: any[];
	possibly_sensitive: boolean;
	profile_banner_url: string;
	profile_interstitial_type: string;
	statuses_count: number;
	translator_type: string;
	url: string;
	withheld_in_countries: any[];
}

export interface Entities8 {
	description: Description6;
	url: Url16;
}

export interface Description6 {
	urls: Url15[];
}

export interface Url15 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Url16 {
	urls: Url17[];
}

export interface Url17 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Location6 {
	location: string;
}

export type MediaPermissions6 = {};

export interface Professional6 {
	rest_id: string;
	professional_type: string;
	category: Category3[];
}

export interface Category3 {
	id: number;
	name: string;
	icon_name: string;
}

export interface ProfileBio6 {
	description: string;
}

export interface Privacy6 {
	protected: boolean;
}

export type RelationshipPerspectives6 = {};

export interface Verification6 {
	verified: boolean;
}

export interface ExtMediaAvailability4 {
	status: string;
}

export interface Sizes4 {
	large: Large7;
	medium: Medium7;
	small: Small7;
	thumb: Thumb4;
}

export interface Large7 {
	h: number;
	w: number;
	resize: string;
}

export interface Medium7 {
	h: number;
	w: number;
	resize: string;
}

export interface Small7 {
	h: number;
	w: number;
	resize: string;
}

export interface Thumb4 {
	h: number;
	w: number;
	resize: string;
}

export interface OriginalInfo4 {
	height: number;
	width: number;
	focus_rects: FocusRect4[];
}

export interface FocusRect4 {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface AllowDownloadStatus4 {
	allow_download: boolean;
}

export interface VideoInfo4 {
	aspect_ratio: number[];
	duration_millis: number;
	variants: Variant4[];
}

export interface Variant4 {
	content_type: string;
	url: string;
	bitrate?: number;
}

export interface MediaResults4 {
	result: Result13;
}

export interface Result13 {
	media_key: string;
}

export interface Features4 {
	large: Large8;
	medium: Medium8;
	small: Small8;
	orig: Orig4;
}

export interface Large8 {
	faces: Face13[];
}

export interface Face13 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Medium8 {
	faces: Face14[];
}

export interface Face14 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Small8 {
	faces: Face15[];
}

export interface Face15 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface Orig4 {
	faces: Face16[];
}

export interface Face16 {
	x: number;
	y: number;
	h: number;
	w: number;
}

export interface QuotedStatusPermalink2 {
	url: string;
	expanded: string;
	display: string;
}

export interface NoteTweet {
	is_expandable: boolean;
	note_tweet_results: NoteTweetResults;
}

export interface NoteTweetResults {
	result: Result14;
}

export interface Result14 {
	id: string;
	text: string;
	entity_set: EntitySet;
	richtext: Richtext;
	media: Media;
}

export interface EntitySet {
	hashtags: any[];
	symbols: any[];
	urls: Url18[];
	user_mentions: any[];
}

export interface Url18 {
	display_url: string;
	expanded_url: string;
	url: string;
	indices: number[];
}

export interface Richtext {
	richtext_tags: RichtextTag[];
}

export interface RichtextTag {
	from_index: number;
	to_index: number;
	richtext_types: string[];
}

export interface Media {
	inline_media: any[];
}

export interface QuotedRefResult {
	result: Result15;
}

export interface Result15 {
	__typename: string;
	rest_id: string;
}

export interface ClientEventInfo {
	component: string;
	element: string;
}

export interface Metadata {
	scribeConfig: ScribeConfig;
}

export interface ScribeConfig {
	page: string;
}
