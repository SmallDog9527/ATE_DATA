
#include "stdafx.h"
//#define _CRT_SECURE_NO_WARNINGS /D _CRT_SECURE_NO_WARNINGS
#include "treg.h"
//#include "../inireader/inireader.h"
#include "inireader.h"
#pragma comment(lib, "User32.lib")
bool dll_active_sites[MS_MAX_SITES];

///////////////////////////////////////////////////////////////////////////////
// Macros for looping over sites
// lzg
bool active_site(int site) {
	BYTE sitesta[SITE_NUM]; 
	StsGetSiteStatus(sitesta,SITE_NUM); 
	return (sitesta[site] != 0);
} 
#ifdef TREG_ETS364
#   define TREG_SERIAL for(treg_site=0; treg_site<TREG::num_sites(); treg_site++) if(msSiteStat(treg_site))
#else
//#   define TREG_SERIAL for(treg_site=0; treg_site<TREG::num_sites(); treg_site++) if(dll_active_sites[treg_site])
#   define TREG_SERIAL for(treg_site=0; treg_site<SITE_NUM; treg_site++) if(active_site(treg_site))	// lzg
#endif
#ifdef _DEBUG
#   define TSITE (assert(treg_site<SITE_NUM && treg_site>=0),treg_site)
#   define NOP volatile int a = 0;  // useful for conditional breakpoints; ensures compiler doesn't optimize out that line 
#else
#   define TSITE treg_site
#   define NOP int a = 0;
#endif
#define TREG_SERIAL_ALL for(treg_site=0; treg_site<TREG::num_sites(); treg_site++)

#if defined( _MSC_VER ) && (_MSC_VER <= 1200)    // 1200 = MSVC 6.0.
#   define ERROR_INVALID_SITE "TREG: Error: Invalid site %d passed.",site
#else
#   define ERROR_INVALID_SITE "TREG: Error: Invalid site %d passed to %s()",site,__FUNCTION__
#endif

#define CHECK_SITE if(site!=MS_ALL && !(site>=0 && site<TREG::num_sites())) { \
                            TREG_ERROR::error(ERROR_INVALID_SITE); \
 
#define CHECK_SITE_EXIT    CHECK_SITE return  ;}
#define CHECK_SITE_EXIT_0  CHECK_SITE return 0;}

///////////////////////////////////////////////////////////////////////////////
// Macros for looping over trim steps
#define LOOP_STEPS(var) \
            for(var=0;var<steps;var++) \
                if(step_enabled[var])

#define LOOP_STEPS_ALL(var) \
            for(var=0;var<steps;var++)

///////////////////////////////////////////////////////////////////////////////
// Other macros
#define LCASE_STRING(var) \
            transform(var.begin(), var.end(), var.begin(), ::tolower);

#define MALLOC(ptr,typ,cnt) ptr=(typ*)malloc((cnt)*sizeof(typ))
#define FREE(ptr) if(ptr) {free(ptr);ptr=NULL;}

#define LOGLEVEL(f) if((f&log_level)==f)

#define MAX(x,y) ((x)>(y)?(x):(y))
#define MIN(x,y) ((x)<(y)?(x):(y))

#ifdef TREG_ETS364
// Extract limits from testlist
static get_limits_t get_limits_func=NULL;
static log_data_t log_data_func=NULL;
static test_t test_func=NULL;
static bool get_limits(int tnum, double *lolim = NULL, double *hilim = NULL, int bin_no = 1, 
                       char *unit = NULL, int unit_len=0, double *sc = NULL, char *test = NULL, int test_len=0)
{
    if(get_limits_func)
        return !!get_limits_func(tnum,lolim,hilim,test,test_len,unit,unit_len,sc);

    // fallback for older char_setup libs .... to be deleted
    TISHELL_API int  TestNumber_Map[];  // from uicclib.h
    TISHELL_API char Dlog1[][19];       // from uicclib.h
    TISHELL_API char Dlog2[][11];       // from uicclib.h
    TISHELL_API	char SpecUnit[][6][5];  // from uicclib.h

    int MaxTests = abs(FinalSpecHi - FinalSpecLo);
    int ofs;

    for(ofs = 0; ofs < MaxTests; ofs++) {
        if(TestNumber_Map[ofs] == tnum) {
            if(lolim)
                *lolim = FinalSpecLo[ofs][bin_no];
            if(hilim)
                *hilim = FinalSpecHi[ofs][bin_no];
            if(test)
                sprintf(test,"%s%s", Dlog1[ofs], Dlog2[ofs]);
            if(unit)
                sprintf(unit,"%s", SpecUnit[ofs][bin_no]);
            if(unit && sc) {
                // units and scaling copied from tl_reader.cpp
                double factor = 1e+12;
                if(strcmp(unit, "KV")   == 0) factor = 1e+3; 
                if(strcmp(unit, "V")    == 0) factor = 1; 
                if(strcmp(unit, "MV")   == 0) factor = 1e-3; 
                if(strcmp(unit, "UV")   == 0) factor = 1e-6;
                if(strcmp(unit, "NV")   == 0) factor = 1e-9; 
                if(strcmp(unit, "A")    == 0) factor = 1; 
                if(strcmp(unit, "MA")   == 0) factor = 1e-3; 
                if(strcmp(unit, "UA")   == 0) factor = 1e-6;
                if(strcmp(unit, "NA")   == 0) factor = 1e-9; 
                if(strcmp(unit, "PA")   == 0) factor = 1e-12; 
                if(strcmp(unit, "OHM")  == 0) factor = 1; 
                if(strcmp(unit, "KOHM") == 0) factor = 1e+3; 
                if(strcmp(unit, "MOHM") == 0) factor = 1e+6; 
                if(strcmp(unit, "H")    == 0) factor = 1; 
                if(strcmp(unit, "MH")   == 0) factor = 1e-3; 
                if(strcmp(unit, "UF")   == 0) factor = 1e-6; 
                if(strcmp(unit, "NF")   == 0) factor = 1e-9; 
                if(strcmp(unit, "PF")   == 0) factor = 1e-12; 
                if(strcmp(unit, "W")    == 0) factor = 1;
                if(strcmp(unit, "MW")   == 0) factor = 1e-3;
                if(strcmp(unit, "UW")   == 0) factor = 1e-6;
                if(strcmp(unit, "HZ")   == 0) factor = 1; 
                if(strcmp(unit, "KHZ")  == 0) factor = 1e+3; 
                if(strcmp(unit, "MHZ")  == 0) factor = 1e+6;
                if(strcmp(unit, "GHZ")  == 0) factor = 1e+9;
                if(strcmp(unit, "S")    == 0) factor = 1;	
                if(strcmp(unit, "MS")   == 0) factor = 1e-3;	
                if(strcmp(unit, "US")   == 0) factor = 1e-6;	
                if(strcmp(unit, "NS")   == 0) factor = 1e-9;	
                if(strcmp(unit, "DGR")  == 0) factor = 1; 
                if(strcmp(unit, "MDGR") == 0) factor = 1e-3; 
                if(strcmp(unit, "RAD")  == 0) factor = 1; 
                if(strcmp(unit, "MRAD") == 0) factor = 1e-3; 
                if(strcmp(unit, "M")    == 0) factor = 1; 
                if(strcmp(unit, "MM")   == 0) factor = 1e-3; 
                if(strcmp(unit, "UM")   == 0) factor = 1e-6;
                if(strcmp(unit, "INCH") == 0) factor = 1; 
                if(strcmp(unit, "PCNT") == 0) factor = 1e-2;
                if(strcmp(unit, "PPM")  == 0) factor = 1e-6; 
                if(strcmp(unit, "DB")   == 0) factor = 1;
                *sc = factor;
            }
            return true;
        }
    }
    return false;
}
#endif

static void bubbleSort(double *array, int length) {
    int i, j;

    for(i = 0; i < length; i++) {
        for(j = 0; j < i; j++) {
            if(array[i] < array[j]) {
                double temp = array[i]; //swap
                array[i] = array[j];
                array[j] = temp;
            }
        }
    }
}

static double calc_quartile(double *array, double q_index) {

    double intpart, fractpart;
    int x1, x2;

    fractpart = modf(q_index, &intpart);
    x1 = (int)intpart - 1;
    x2 = (int)intpart;

    return  array[x1] + (array[x2] - array[x1]) * fractpart;
}

double default_trim_grp_error_func(TRIM_GRP_NODE &node, unsigned site) {
    unsigned i;
    double   error_squared = 0;

    for(i = 0; i < node.count(); i++) {
        error_squared = MAX(error_squared, node(i).get_normalized_error_squared(site));
    }
    return error_squared;
}

///////////////////////////////////////////////////////////////////////////////
// TREG_ERROR
void (*TREG_ERROR::error_func)(const char *) = NULL;

#ifdef TREG_ETS364
static void default_error_func(const char *msg) {etsfatalerror((char *)msg);}
//#elif WIN32
//static void default_error_func(const char *msg) {printf("%s\n", msg);}
#else
static void default_error_func(const char *msg) {MessageBox(NULL, msg, "TREG Error", MB_OK);}
//static void default_error_func(const char *msg) {printf("%s\n", msg);}
#endif

TREG_ERROR::TREG_ERROR() {
    TREG_ERROR::error_func = default_error_func;
}

TREG_ERROR::~TREG_ERROR() {

}

void TREG_ERROR::error(const char *msg, ...) {
    char buff[4096];
    va_list marker;
    va_start(marker, msg);
    int size = sizeof(buff);
    _vsnprintf_s(buff, size, msg, marker);
    buff[size - 1] = '\0';
    va_end(marker);

    if(error_func)
        error_func(buff);
}

void TREG_ERROR::register_error_func(void (*func)(const char *)) {
    error_func = func;
}

///////////////////////////////////////////////////////////////////////////////
// TREG_LOG
void (*TREG_LOG::datalog_func)(unsigned tnum, double value, int site) = NULL;

TREG_LOG::TREG_LOG() {

}

TREG_LOG::~TREG_LOG() {

}

void TREG_LOG::log_data(unsigned tnum, unsigned index, double value, int site, bool use_mslogdata, bool allow_mslogdata, string testname, double ll, double ul, const char *unit) {

#ifdef TREG_ETS364
    if(log_data_func && test_func) {
        unsigned testnum;
        if(use_mslogdata)
            testnum = tnum;
        else
            testnum = tnum + index;

        if(TREG::eng_mode()) {
            if(!get_limits(testnum)) { // check if test# exists
                TREG_ERROR::error("TREG: Test number '%d' doesn't exist.", testnum);
                return;
            }
        }

        if(use_mslogdata && allow_mslogdata) {
            char u[5]; // size from uicclib.h
            double sc = 1.0;
            if(!unit || ll == FLT_MAX || ul == FLT_MAX)
                get_limits(tnum, &ll, &ul, 1, u, sizeof(u), &sc);  // bin is hardcoded to 1 currently!
            if(unit)
                strncpy(u, unit, 5);
            SetTestNumber(testnum);
            SetSubTestNumber(index);
            log_data_func(site, (char *)testname.c_str(), ll/sc, ul/sc, value/sc, u, 1);
            //msLogData(site, (char *)testname.c_str(), 9.4, ll/sc, ul/sc, value/sc, u);
        } else {
            test_func(testnum, value, site, 0);
        }

    } else { // fallback for older char_setup libs .... to be deleted
        if(TREG_LOG::datalog_func == NULL) { // check if datalog_func is registered
            TREG_ERROR::error("TREG: data-logging function not registered.\n"
                              "Use 'register_dlog_func()' once in your code. \n");
            return;
        }

        unsigned testnum;
        if(use_mslogdata)
            testnum = tnum;
        else
            testnum = tnum + index;

        if(TREG::eng_mode()) {
            if(!get_limits(testnum)) { // check if test# exists
                TREG_ERROR::error("TREG: Test number '%d' doesn't exist.", testnum);
                return;
            }
        }

        if(use_mslogdata && allow_mslogdata) {
            char u[5]; // size from uicclib.h
            double sc = 1.0;
            if(!unit || ll == FLT_MAX || ul == FLT_MAX)
                get_limits(tnum, &ll, &ul, 1, u, sizeof(u), &sc);  // bin is hardcoded to 1 currently!
            if(unit)
                strncpy(u, unit, 5);
            SetTestNumber(testnum);
            SetSubTestNumber(index);
            msLogData(site, (char *)testname.c_str(), 9.4, ll/sc, ul/sc, value/sc, u);
        } else {
            datalog_func(testnum, value, site);
        }
    }
#else
    datalog_func(tnum + index, value, site);
#endif
}

void TREG_LOG::register_dlog_func(void (*func)(unsigned tnum, double value, int site)) {
    datalog_func = func;
}

///////////////////////////////////////////////////////////////////////////////
// STORAGE
STORAGE::STORAGE() {
    start = read_back = working = programmed = saved = internal_storage = NULL;

    MALLOC(start,            unsigned, MS_MAX_SITES);
    MALLOC(read_back,        unsigned, MS_MAX_SITES);
    MALLOC(working,          unsigned, MS_MAX_SITES);
    MALLOC(programmed,       unsigned, MS_MAX_SITES);
    MALLOC(saved,            unsigned, MS_MAX_SITES);
    MALLOC(internal_storage, unsigned, MS_MAX_SITES);

    storage_allocated = true;

    TREG_SERIAL_ALL {
        start[TSITE] = read_back[TSITE] = working[TSITE] = programmed[TSITE] = \
        saved[TSITE] = internal_storage[TSITE] = 0;
    }

    treg_site = 0;
}

STORAGE::~STORAGE() {
    if(storage_allocated) {
        FREE(start);
        FREE(read_back);
        FREE(working);
        FREE(programmed);
        FREE(saved);
        FREE(internal_storage);
        storage_allocated = false;
    } else {
        start = read_back = working = programmed = saved = internal_storage = NULL;
    }
}

unsigned STORAGE::get_working(int site) {
    CHECK_SITE_EXIT_0
    return working[site];
}

unsigned STORAGE::get_programmed(int site) {
    CHECK_SITE_EXIT_0
    return programmed[site];
}

unsigned STORAGE::get_read_back(int site) {
    CHECK_SITE_EXIT_0
    return read_back[site];
}

unsigned STORAGE::get_saved(int site) {
    CHECK_SITE_EXIT_0
    return saved[site];
}

unsigned STORAGE::get_start(int site) {
    CHECK_SITE_EXIT_0
    return start[site];
}

void STORAGE::free_storage_memory() {
    if(storage_allocated) {
        FREE(start);
        FREE(read_back);
        FREE(working);
        FREE(programmed);
        FREE(saved);
        FREE(internal_storage);

        storage_allocated = false;
    }
}

void STORAGE::set_working(unsigned value, int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL working[TSITE] = value;
    } else {
        CHECK_SITE_EXIT
        working[site] = value;
    }
}

void STORAGE::set_programmed(unsigned value, int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL programmed[TSITE] = value;
    } else {
        CHECK_SITE_EXIT
        programmed[site] = value;
    }
}

void STORAGE::set_read_back(unsigned value, int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL read_back[TSITE] = value;
    } else {
        CHECK_SITE_EXIT
        read_back[site] = value;
    }
}

void STORAGE::set_saved(unsigned value, int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL saved[TSITE] = value;
    } else {
        CHECK_SITE_EXIT
        saved[site] = value;
    }
}

void STORAGE::save_working(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL saved[TSITE] = working[TSITE];
    } else {
        CHECK_SITE_EXIT
        saved[site] = working[site];
    }
}

void STORAGE::save_read_back(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL saved[TSITE] = read_back[TSITE];
    } else {
        CHECK_SITE_EXIT
        saved[site] = read_back[site];
    }
}

void STORAGE::restore_working(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL working[TSITE] = saved[TSITE];
    } else {
        CHECK_SITE_EXIT
        working[site] = saved[site];
    }
}

void STORAGE::restore_read_back(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL read_back[TSITE] = saved[TSITE];
    } else {
        CHECK_SITE_EXIT
        read_back[site] = saved[site];
    }
}

void STORAGE::copy_work_to_prog(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL programmed[TSITE] = working[TSITE];
    } else {
        CHECK_SITE_EXIT
        programmed[site] = working[site];
    }
}
void STORAGE::copy_work_to_read(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL read_back[TSITE] = working[TSITE];
    } else {
        CHECK_SITE_EXIT
        read_back[site] = working[site];
    }
}
void STORAGE::copy_prog_to_work(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL working[TSITE] = programmed[TSITE];
    } else {
        CHECK_SITE_EXIT
        working[site] = programmed[site];
    }
}
void STORAGE::copy_prog_to_read(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL read_back[TSITE] = programmed[TSITE];
    } else {
        CHECK_SITE_EXIT
        read_back[site] = programmed[site];
    }
}
void STORAGE::copy_read_to_work(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL working[TSITE] = read_back[TSITE];
    } else {
        CHECK_SITE_EXIT
        working[site] = read_back[site];
    }
}
void STORAGE::copy_read_to_prog(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL programmed[TSITE] = read_back[TSITE];
    } else {
        CHECK_SITE_EXIT
        programmed[site] = read_back[site];
    }
}
void STORAGE::copy_start_to_work(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL working[TSITE] = start[TSITE];
    } else {
        CHECK_SITE_EXIT
        working[site] = start[site];
    }
}
void STORAGE::copy_start_to_read(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL read_back[TSITE] = start[TSITE];
    } else {
        CHECK_SITE_EXIT
        read_back[site] = start[site];
    }
}
void STORAGE::copy_start_to_prog(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL programmed[TSITE] = start[TSITE];
    } else {
        CHECK_SITE_EXIT
        programmed[site] = start[site];
    }
}

///////////////////////////////////////////////////////////////////////////////
// TRIM_STEP_HIST
TRIM_STEP_HIST::TRIM_STEP_HIST() {
    hist_index = 0;
    average_value = 0;
    hist_depth = 0;
    units_measured = 0;
    treg_site = 0;
}

TRIM_STEP_HIST::~TRIM_STEP_HIST() {

}

void TRIM_STEP_HIST::init(unsigned history_depth) {

    hist_depth = history_depth < TRIM_STEP_ADJ_DEPTH ? history_depth : TRIM_STEP_ADJ_DEPTH;

    TREG_SERIAL_ALL {
        step_value[TSITE] = 0;
        step_value_received[TSITE] = false;
    }

    for(unsigned i = 0; i < hist_depth; i++) {
        history[i] = 0;
        valid_hist_value[i] = false;
    }
}

void TRIM_STEP_HIST::put_char_table_value(double value, int site) {
    CHECK_SITE_EXIT
    step_value[site] = value;
    step_value_received[site] = true;
}

double TRIM_STEP_HIST::get_char_table_value(int site) {
    CHECK_SITE_EXIT_0
    return step_value[site];
}

void TRIM_STEP_HIST::clear_char_table_value(int site) {
    CHECK_SITE_EXIT
    step_value[site] = 0;
    step_value_received[site] = false;
}

void TRIM_STEP_HIST::fill_table(double value) {
    for(unsigned i = 0; i < hist_depth; i++) {
        history[i] = value;
        valid_hist_value[i] = true;
    }
    hist_index = 0;
}

bool TRIM_STEP_HIST::value_received(int site) {
    CHECK_SITE_EXIT_0
    return step_value_received[site];
}

void TRIM_STEP_HIST::update_history(double value) {
    average_value = ((average_value * hist_depth) - history[hist_index] + value) / hist_depth; // calculate running average
    history[hist_index] = value; // overwrite oldest value in ring buffer
    valid_hist_value[hist_index] = true;

    if(hist_index < hist_depth - 1)
        hist_index++;
    else
        hist_index = 0;  // form ring buffer
}

void TRIM_STEP_HIST::calc_avg() {
    double avg = 0;
    for(unsigned i = 0; i < hist_depth; i++)
        avg += history[i];
    average_value = avg / hist_depth;
}

void TRIM_STEP_HIST::filter_outliers() {

    double      n = 1.5;        // 1.5 = mild outliers ; 3 = extreme outliers
    double      lower_limit;
    double      upper_limit;
    double      q1, q3;
    double      mean = 0;
    unsigned    counter = 0;
    unsigned    i;

    bubbleSort(history, units_measured);

    if(units_measured >= 4) { // require at least 4 samples for outlier filtering
        q1 = calc_quartile(history, units_measured / 4.0);
        q3 = calc_quartile(history, units_measured / 4.0 * 3.0);

        lower_limit = q1 - n * (q3 - q1);
        upper_limit = q3 + n * (q3 - q1);

        // mark limits ouside of outlier limits--------
        for(i = 0; i < units_measured; i++) {
            if(history[i] >= lower_limit && history[i] <= upper_limit)
                valid_hist_value[i] = true;
            else
                valid_hist_value[i] = false;
        }
    }

    // calculate new mean ------------------
    for(i = 0; i < units_measured; i++) {
        if(valid_hist_value[i]) {
            mean += history[i];
            counter++;
        }
    }
    mean /= counter;

    // fill history table with new mean value ------
    fill_table(mean);
    calc_avg();
}

///////////////////////////////////////////////////////////////////////////////
// TRIM_NODE
TRIM_NODE::TRIM_NODE() {
    TREG_SERIAL_ALL {
        post_trimming[TSITE] = 0;
        trim_is_active[TSITE] = true;
    }
    learn_trim_start_valid = false;
    table_char_always_on = false;
    table_char_on = true;
    allow_skip_post_measurement = true;
    use_msLogData = false;
    enable_experimental = false;
    nom_step = 0;
    steps = 0;
    treg_site = 0;
    retry_cnt = 0;
    learn_trim_start = 0;
    learn_trim_step = 0;
    table_char_units_remaining = 0;
    table_char_units = 0;
	QC = 0;
	DO_TRIM = 0;

    for(unsigned i = 0; i < TRIM_STEP_ADJ_DEPTH; i++) {
        min_measured[i] = +FLT_MAX;
        max_measured[i] = -FLT_MAX;
    }

    for(unsigned j = 0; j < MAX_TRIM; j++) // enable all steps
        step_enabled[j] = true;
}

TRIM_NODE::~TRIM_NODE() {

}

void TRIM_NODE::table_char(double trim_step_value, unsigned trim_step, int site) {
    CHECK_SITE_EXIT
    if(trim_step < steps) {
        if(step_enabled[trim_step])
            learn_table[trim_step].put_char_table_value(trim_step_value, site);
    }
}

void TRIM_NODE::table_char(RESULTS_STR *trim_step_values, unsigned trim_step) {
    TREG_SERIAL_ALL table_char(trim_step_values[TSITE].value, trim_step, TSITE);
}

void TRIM_NODE::table_char(double *trim_step_values, unsigned trim_step) {
    TREG_SERIAL_ALL table_char(trim_step_values[TSITE], trim_step, TSITE);
}

void TRIM_NODE::pre(double pre_value, int site, double trim_hysteresis_pcnt) {

    CHECK_SITE_EXIT

    set_pre_reading(pre_value, site);

    if(trim_is_active[site]) { // trimming is enabled
        double calc_post_value = 0.0;

        unsigned new_working = find_best_step(pre_trimming[site], pre_value, calc_post_value, site); // 'calc_post_value' gets updated to guessed final trim result

        if(trim_hysteresis_pcnt > 0.0) { // update working only if new result is closer to target by at least trim_hysteresis_pcnt

            double delta = fabs(fabs(pre_value - target[site]) - fabs(calc_post_value - target[site]))
                                              / fabs(pre_value - target[site] + 1e-15) * 100.0;        
            if(!(delta > trim_hysteresis_pcnt))
                new_working = pre_trimming[site]; // keep working on pre_trimming step
        }

        working[site] = new_working;

    } else { // trimming is disabled
        unsigned step;
        LOOP_STEPS(step) guessed_final[site][step] = calc_estimate(site, step, pre_value, pre_trimming[site]);
        working[site] = programmed[site];
    }

    // check if working has changed
    trim_value_changed[site] = (pre_trimming[site] != working[site]) ? true : false;
}

void TRIM_NODE::pre(RESULTS_STR *pre_values, double trim_hysteresis_pcnt) {
    TREG_SERIAL_ALL pre(pre_values[TSITE].value, TSITE, trim_hysteresis_pcnt);
}

void TRIM_NODE::pre(double *pre_values, double trim_hysteresis_pcnt) {
    TREG_SERIAL_ALL pre(pre_values[TSITE], TSITE, trim_hysteresis_pcnt);
}

void TRIM_NODE::set_pre_reading(double value, int site) {

    CHECK_SITE_EXIT

    pre_trimming[site] = working[site];
    pre_reading[site] = value;

    if(!pre_measured[site]) {
        first_pre_trimming[site] = working[site];
        first_pre_reading[site] = value;
    }

    pre_measured[site] = true;
}

void TRIM_NODE::set_pre_reading(double *values) {
    TREG_SERIAL_ALL set_pre_reading(values[TSITE], TSITE);
}

void TRIM_NODE::set_pre_reading(RESULTS_STR *values) {
    TREG_SERIAL_ALL set_pre_reading(values[TSITE].value, TSITE);
}

void TRIM_NODE::post(RESULTS_STR *values) {
    TREG_SERIAL_ALL post(values[TSITE].value, TSITE);
}

void TRIM_NODE::post(double *values) {
    TREG_SERIAL_ALL post(values[TSITE], TSITE);
}

void TRIM_NODE::post(double value, int site) {
    CHECK_SITE_EXIT
    post_reading[site]  = value;
    post_trimming[site] = working[site];
    post_measured[site] = true;
}

void TRIM_NODE::sot() {

    unsigned step, best_step = 0;

    TREG_SERIAL_ALL {
        pre_trimming[TSITE] = first_pre_trimming[TSITE] = post_trimming[TSITE] = 0;
        pre_reading[TSITE] = first_pre_reading[TSITE] = post_reading[TSITE] = 0.0;
        pre_measured[TSITE] = post_measured[TSITE] = false;
    }

    LOOP_STEPS(step) {
        TREG_SERIAL_ALL learn_table[step].clear_char_table_value(TSITE);
        // search for most frequently used trim step
        if(performed_trims[step] > performed_trims[best_step] && performed_trims[step] >= learn_trim_start) {
            learn_trim_start_valid = true;
            best_step = step;
        }
    }

    if(best_step != learned_start_step && start_learn_valid() && learn_trim_start && get_trim_allowed() && !table_char_units_remaining) {
        // a better start trim step was found; update 'learned_start_step' and re-calculate learned trim table 
        learned_start_step = best_step;
        if(trim_rel_mode) // Parameter uses a RELATIVE Trim table
            LOOP_STEPS_ALL(step) learn_table[step].fill_table(calc_rel_step_estimate(best_step, step));
        else              // Parameter uses a ABSOLUTE Trim table
            LOOP_STEPS_ALL(step) learn_table[step].fill_table(calc_abs_step_estimate(best_step, step));
        LOOP_STEPS_ALL(step) learn_table[step].calc_avg();
    }

    TREG_SERIAL_ALL {
        programmed[TSITE] = read_back[TSITE] = saved[TSITE] = internal_storage[TSITE] = 0; // clear storages

        // 'learned_start_step' is initialized to 'nom_step' in TRIM_NODE::init() and is only
        // changed if learning is enabled and a better step was found in the code lines above.
        working[TSITE] = start[TSITE] = learned_start_step; // defaults to 'nom_step'

        target[TSITE] = sot_target;
        trim_value_changed[TSITE] = true;

        // fill guessed_final array
        LOOP_STEPS(step) guessed_final[TSITE][step] = calc_estimate(TSITE, step, sot_target, start[TSITE]);
    }
}

void TRIM_NODE::eot() {

    unsigned step;
    double delta;

    TREG_SERIAL {
        if(unit_passed(TSITE) && trim_is_active[TSITE]) {
            if(learn_trim_start && pre_measured[TSITE] && post_measured[TSITE]) { // Learn default trim step
                performed_trims[post_trimming[TSITE]]++;
                // if one trim step was used more than TRIM_START_ADJ_DEPTH times decrease ALL step counts by 1
                if(performed_trims[post_trimming[TSITE]] > TRIM_START_ADJ_DEPTH) {
                    LOOP_STEPS(step) {
                        if(performed_trims[step] > 0)
                            performed_trims[step]--;
                    }
                }
            }

            if(learn_trim_step) {
                if(table_char_units_remaining) { // Learn trim step size from trim table characterization
                    if(all_steps_received(TSITE)) {
                        if(table_char_units_remaining == table_char_units)
                            LOOP_STEPS(step) learn_table[step].reset_history_index(); // reset history index at the start of table characterization 
                        LOOP_STEPS(step) {
                            if(trim_rel_mode) // Parameter uses RELATIVE Trim table
                                delta = learn_table[step].get_char_table_value(TSITE) / learn_table[learned_start_step].get_char_table_value(TSITE);
                            else              // Parameter uses ABSOLUTE Trim table
                                delta = learn_table[step].get_char_table_value(TSITE) - learn_table[learned_start_step].get_char_table_value(TSITE);
                            learn_table[step].update_history(delta);
                            learn_table[step].units_measured++;

                            // track minimum and maximum measured value for every characterized unit
                            min_measured[table_char_units_remaining - 1] = MIN(min_measured[table_char_units_remaining - 1], learn_table[step].get_char_table_value(TSITE));
                            max_measured[table_char_units_remaining - 1] = MAX(max_measured[table_char_units_remaining - 1], learn_table[step].get_char_table_value(TSITE));
                        }
                        table_char_units_remaining--;
                    }
                    if(!table_char_units_remaining) { // filter outliers once table char has been completed
                        LOOP_STEPS(step) {
                            learn_table[step].filter_outliers();
                            learn_table[step].units_measured = 0;
                        }

                        // calculate expected parameter range for predictability monitoring:
                        // readings outside of the trim range (=based on IQR of 'min_measured' and 'max_measured')
                        // are NOT used for predictabiliy monitoring and considered failed units / outliers.
                        calc_expected_range(min_measured, table_char_units, &expected_range.min, NULL);
                        calc_expected_range(max_measured, table_char_units, NULL, &expected_range.max);
                    }
                } else { // Learn trim step size during normal runs
                    if(pre_measured[TSITE] && post_measured[TSITE]) {
                        // Use first_pre_trimming/first_pre_reading here to ensure that learning still happens if somebody
                        // calls pre() more often than once. Otherwise pre_trimming[TSITE] == start[TSITE] would most
                        // likely never become true and would prevent learning to occur.
                        if(first_pre_trimming[TSITE] == start[TSITE] && first_pre_trimming[TSITE] != post_trimming[TSITE]) {
                            if(trim_rel_mode) // Parameter uses RELATIVE Trim table
                                delta = post_reading[TSITE] / first_pre_reading[TSITE];
                            else              // Parameter uses ABSOLUTE Trim table
                                delta = post_reading[TSITE] - first_pre_reading[TSITE];
                            learn_table[post_trimming[TSITE]].update_history(delta);
                        }
                    }
                }
            }
        }
    }

    if(enable_experimental) {
        TREG_SERIAL_ALL { // using TREG_SERIAL_ALL as we want to track predictability also for failed sites.
            if(pre_measured[TSITE] && post_measured[TSITE] && (first_pre_trimming[TSITE] == start[TSITE]) && trim_value_changed[TSITE] && !table_char_units_remaining) {
                update_predictability(TSITE);
            }
        }

        if(learn_trim_step && table_char_units && (predictability.cnt >= predictability.size)) { // check if learning and table char are enabled
            if(!check_predictability()) {  // check if pedictability is still good
                // restart table characterization
                restart_table_char();         
                // reset predictability array
                memset(&predictability, 0, sizeof(predictability));
                predictability.size = (int)(learn_trim_step) > PREDICTABILITY_BUFFER_SIZE ? learn_trim_step : PREDICTABILITY_BUFFER_SIZE;
            }
        }
    }
}

void TRIM_NODE::update_predictability(int site) {
    
    if(get_post_reading(site) > expected_range.min && get_post_reading(site) < expected_range.max) {
       double value = get_guessed_final(site) - get_post_reading(site);
       if(value != 0) { // disregard results with perfect predictability
            // clamp ring buffer size
            predictability.cnt >= predictability.size ? predictability.cnt = predictability.size : predictability.cnt++;
            predictability.value[predictability.index] = value;
            // form ring buffer
            predictability.index < predictability.size - 1 ? predictability.index++ : predictability.index = 0;
        } else
            if(debug)
                NOP; // predictability = 0 (occurs when updated_by_trim() is false -> could be evaluated for measurement accuracy (TCS like)
    } else
        if(debug)
            NOP; // outlier/failed unit detected
}

void TRIM_NODE::calc_expected_range(double *values, unsigned cnt, double *min, double *max) {
  
    double      n = 3;             // number of IQRs
    double      q1, q3;

    bubbleSort(values, cnt);

    if(cnt >= 4) {
        q1 = calc_quartile(values, cnt / 4.0);
        q3 = calc_quartile(values, cnt / 4.0 * 3.0);
    }

    if(min)
        *min = cnt >= 4 ? q1 - n * (q3 - q1) : -FLT_MAX;
    if(max)
        *max = cnt >= 4 ? q3 + n * (q3 - q1) :  FLT_MAX;
}

bool TRIM_NODE::check_predictability() {

    double      n = 6;              // number of IQRs for LL/UL
    unsigned    max_cnt = 2;        // number of samples required outside of limits to consider predictability as bad
    double      q1, q3;
    unsigned    cnt = 0;
    unsigned    i = 0;

    PRED_STRUCT p = predictability; // local copy of predictability struct

    bubbleSort(p.value, p.cnt);

    q1 = calc_quartile(p.value, p.cnt / 4.0);
    q3 = calc_quartile(p.value, p.cnt / 4.0 * 3.0);

    predictability.lower_limit = q1 - n * (q3 - q1);
    predictability.upper_limit = q3 + n * (q3 - q1);

    // count number samples outside limits
    for(i = 0; i < p.cnt; i++) {
        if(p.value[i] <= predictability.lower_limit || p.value[i] >= predictability.upper_limit)
            cnt++;
    }

    if(cnt > 0 && debug)
        NOP;

    return cnt >= max_cnt ? false : true;
}

bool TRIM_NODE::unit_passed(int site) {
    CHECK_SITE_EXIT_0
#ifdef TREG_ETS364
    int current_bin = msBinValue(TSITE); // returns current bin
    switch(current_bin) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
            return true; break; // 1-5 are pass bins on ETS364
        default:
            return false;
    }
#else
		int current_bin= StsGetCurrentDutSwBin(TSITE);
    switch(current_bin) {
        case 1:
        case 2:
        case 3:
        case 4:
            return true; break; // 1-5 are pass bins on ACCO
        default:
            return false;
    }
//#else
//    return true;
#endif
}

bool TRIM_NODE::all_steps_received(int site) {
    CHECK_SITE_EXIT_0
    unsigned step;
    LOOP_STEPS(step) {
        if(!learn_table[step].value_received(site))
            return false;
    }
    return true;
}

void TRIM_NODE::set_target(double target_value, int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL target[TSITE] = target_value;
    } else {
        CHECK_SITE_EXIT
        target[site] = target_value;
    }
}

double TRIM_NODE::get_target(int site) {
    CHECK_SITE_EXIT_0
    return target[site];
}

void TRIM_NODE::set_trim_type(const char* type) {
    if(!type) return;
    if(!trim_type_exists(type)) {
        TREG_ERROR::error("TREG: unkown trim type '%s' passed to set_trim_type().", type);
        return;
    }
    trim_type = type;
    LCASE_STRING(trim_type);
}

bool TRIM_NODE::trim_type_exists(const char *type) {
    if(!type)
        return false;
    if(_stricmp(type, "min") == 0)
        return true;
    else if(_stricmp(type, "nom") == 0)
        return true;
    else if (_stricmp(type, "max") == 0)
        return true;
    else
        return false;
}

bool TRIM_NODE::updated_by_trim(int site) {

    CHECK_SITE_EXIT_0

    if(!allow_skip_post_measurement)
        return true;

    if(site == MS_ALL) {
        bool trim_inactive = false;
        TREG_SERIAL trim_inactive |= !trim_is_active[TSITE]; // check if trimming is disabled at least for one site
        if(trim_inactive)
            return true;

        TREG_SERIAL {
            if(!pre_measured[TSITE] || (pre_measured[TSITE] && trim_value_changed[TSITE]))
                return true;
        }
    } else {
        if(!trim_is_active[site] || !pre_measured[site] || (pre_measured[site] && trim_value_changed[site]))
            return true;
    }

    return false;
}

void TRIM_NODE::set_trim_allowed(bool turn_on, int site) {
    if(site == MS_ALL) {
        TREG_SERIAL trim_is_active[TSITE] = turn_on;
    } else {
        CHECK_SITE_EXIT
        trim_is_active[site] = turn_on;
    }
}

bool TRIM_NODE::get_trim_allowed(int site) {

    if(site == MS_ALL) { // check if trimming is enabled at least for one site
        bool trim_active = false;
        TREG_SERIAL {
            if(trim_is_active[TSITE]) {
                trim_active = true;
                break;
            }
        }
        return trim_active;
    } else {
        CHECK_SITE_EXIT_0
        return trim_is_active[site];
    }
}

bool TRIM_NODE::start_learn_valid() {
    return learn_trim_start_valid;
}

void TRIM_NODE::restart_table_char() {
    if(!table_char_units_remaining)
        table_char_units_remaining = table_char_units;
}

void TRIM_NODE::set_learn_trim_start(unsigned value) {

    unsigned i;

    // clamp 'learn_trim_start' to TRIM_START_ADJ_DEPTH
    if(value < (TRIM_START_ADJ_DEPTH - 1)) 
        learn_trim_start = value;
    else    
        learn_trim_start = TRIM_START_ADJ_DEPTH - 1;

    // reset trim step histogram
    LOOP_STEPS_ALL(i) performed_trims[i] = 0;
}

void TRIM_NODE::set_learn_trim_step(unsigned value) {

    // clamp 'learn_trim_step' to TRIM_STEP_ADJ_DEPTH
    if(value < TRIM_STEP_ADJ_DEPTH)
        learn_trim_step = value;
    else
        learn_trim_step = TRIM_STEP_ADJ_DEPTH;

    // clamp 'table_char_units_remaining' and 'table_char_units' to TRIM_STEP_ADJ_DEPTH
    if(table_char_units_remaining > TRIM_STEP_ADJ_DEPTH)
        table_char_units_remaining = table_char_units = TRIM_STEP_ADJ_DEPTH;

    // increase samples for step learning to match number of units to be char'ed
    if(learn_trim_step < table_char_units_remaining)
        learn_trim_step = table_char_units_remaining;

    init_learn_table();
}

void TRIM_NODE::set_learn_trim_char(unsigned value) {

    // clamp 'table_char_units_remaining' and 'table_char_units' to TRIM_STEP_ADJ_DEPTH
    if(value < TRIM_STEP_ADJ_DEPTH)
        table_char_units_remaining = table_char_units = value;
    else
        table_char_units_remaining = table_char_units = TRIM_STEP_ADJ_DEPTH;

    // increase samples for step learning to match number of units to be char'ed
    if(learn_trim_step < table_char_units_remaining) {
        learn_trim_step = table_char_units_remaining;
        init_learn_table();
    }
}

void TRIM_NODE::init_learn_table() {
    
    unsigned i;
    
    // setup predictability array and initialize all to 0
    memset(&predictability, 0, sizeof(predictability));
    predictability.size = (int)(learn_trim_step) > PREDICTABILITY_BUFFER_SIZE ? learn_trim_step : PREDICTABILITY_BUFFER_SIZE;

    // initialize learn_table again
    LOOP_STEPS_ALL(i) learn_table[i].init(learn_trim_step);
    if(trim_rel_mode)
        LOOP_STEPS_ALL(i) learn_table[i].fill_table(calc_rel_step_estimate(nom_step, i));
    else
        LOOP_STEPS_ALL(i) learn_table[i].fill_table(calc_abs_step_estimate(nom_step, i));
    LOOP_STEPS_ALL(i) learn_table[i].calc_avg();
}

double TRIM_NODE::calc_rel_step_estimate(unsigned trim1, unsigned trim2) {

    double estimate;
	double aa=learn_table[trim2].get_avg();
     if(trim1 == trim2)
        return 1.0;	 
    else if(learn_trim_step)
        estimate = learn_table[trim2].get_avg() / learn_table[trim1].get_avg(); // use learned trim steps for calculating
    else
        estimate = table[trim2] / table[trim1];                                 // use theoretical trim steps for calculating

    return estimate;
}

double TRIM_NODE::calc_abs_step_estimate(unsigned trim1, unsigned trim2) {

    unsigned    itmp;
    int         flip = 0;
    double      estimate;

    if(trim1 == trim2)
        return 0.0;
    else if(trim1 > trim2) {
        itmp = trim1; trim1 = trim2; trim2 = itmp;
        flip = 1;
    }

    if(learn_trim_step)
        estimate = learn_table[trim2].get_avg() - learn_table[trim1].get_avg(); // use learned trim steps for calculating
    else
        estimate = table[trim2] - table[trim1];                                 // use theoretical trim steps for calculating

    return flip ? -estimate : estimate;
}

double TRIM_NODE::calc_estimate(int site) {
    CHECK_SITE_EXIT_0
    return calc_estimate(site, working[site]);
}

double TRIM_NODE::calc_estimate(int site, unsigned new_step) {
    CHECK_SITE_EXIT_0
    return calc_estimate(site, new_step, pre_reading[site], pre_trimming[site]);
}

double TRIM_NODE::calc_estimate(int site, unsigned new_step, double old_value, unsigned old_step) {
    CHECK_SITE_EXIT_0
    if(learn_trim_step && all_steps_received(site) && table_char_units_remaining) {
        return learn_table[new_step].get_char_table_value(site);
    } else {
        if(trim_rel_mode)
            return old_value * calc_rel_step_estimate(old_step, new_step);
        else
            return old_value + calc_abs_step_estimate(old_step, new_step);
    }
}

unsigned TRIM_NODE::find_best_step(unsigned old_step, double old_value, double &calc_new_value, int site) {

    CHECK_SITE_EXIT_0

    double best_delta_to_target, best_delta_to_target_nom, current_delta_to_target;
    double best_value, best_value_nom, expected_value;
    unsigned step, best_step, best_step_nom;
    bool found = false;

    best_step = best_step_nom = old_step;

    if(learn_trim_step && all_steps_received(site) && table_char_units_remaining)
        best_value = best_value_nom = learn_table[best_step].get_char_table_value(site); // use value from table char if active
    else
        best_value = best_value_nom = old_value; // use passed 'old_value'

    LOOP_STEPS(step) { // loop through all steps and find the best one

        // calculate predicted new value going from 'old_step' to 'step'
        expected_value = guessed_final[site][step] = calc_estimate(site, step, old_value, old_step);

        // look for the absolute delta to find the best step
        current_delta_to_target  = expected_value - target[site];
        best_delta_to_target_nom = best_value_nom - target[site];
        best_delta_to_target     = best_value - target[site];

        if(trim_type == "min") {  // calculate best step for minimum trim (closest to target but bigger)
            if(current_delta_to_target > 0) {
                if(fabs(current_delta_to_target) <= fabs(best_delta_to_target < 0 ? current_delta_to_target : best_delta_to_target)) {
                    best_step = step;
                    best_value = expected_value;
                    found = true;
                }
            }
        }

        if(trim_type == "max") {  // calculate best step for maximum trim (closest to target but smaller)
            if(current_delta_to_target < 0) {
                if(fabs(current_delta_to_target) <= fabs(best_delta_to_target > 0 ? current_delta_to_target : best_delta_to_target)) {
                    best_step = step;
                    best_value = expected_value;
                    found = true;
                }
            }
        }

        // calculate best step for nominal trim (centered arround target)
        if(fabs(current_delta_to_target) < fabs(best_delta_to_target_nom)) {
            best_step_nom = step;
            best_value_nom = expected_value;
        }
    }

    if(trim_type == "nom" || !found) {
        best_step = best_step_nom;
        best_value = best_value_nom;
    }

    calc_new_value = best_value;
    return best_step;
}

bool TRIM_NODE::table_char_active() {
    if(table_char_always_on)
        return true;
    else
        return (table_char_units_remaining && table_char_on && get_trim_allowed()) ? true : false;
}

double TRIM_NODE::get_guessed_final(int site, int trim_step) {
    CHECK_SITE_EXIT_0
    if(trim_step == -1)
        return guessed_final[site][working[site]];
    else
        return guessed_final[site][trim_step];
}

double TRIM_NODE::get_pre_reading(int site) {
    CHECK_SITE_EXIT_0
    return pre_reading[site];
}
double TRIM_NODE::get_post_reading(int site) {
    CHECK_SITE_EXIT_0
    return post_reading[site];
}

void TRIM_NODE::init(string tr_table) {

    char        *p;
    unsigned    count;
    char sep[] = ",";
	char *next_token=NULL;

    char *trim_table;
    trim_table = new char[strlen(tr_table.c_str()) + 1];
    strcpy_s(trim_table, strlen(tr_table.c_str()) + 1, tr_table.c_str());

    // Select trim mode (rel or abs) ---------------------------------------------
    if(strchr(trim_table, '%'))
        trim_rel_mode = true;   // % was found in trim Table -> rel trimming
    else
        trim_rel_mode = false;  // % was NOT found in trim table -> abs trimming

    steps = count = nom_step = 0;

    p = strtok_s(trim_table, sep, &next_token);

    while(p != NULL) {
        int no, cread;

        step_enabled[count] = true;

        if(*p == '(') { // found disabled step
            step_enabled[count] = false;
            p++;
            if(*p == '*') p++; // ignore default for disabled step
        }

        if(*p == '*') {
            p++; nom_step = count; // found default value
        }

        if(trim_rel_mode) {
            no = sscanf_s(p, "%lf%n", table + count, &cread);
            if(no != 1) break;
            table[count] = (table[count] / 100.0) + 1; // convert percentage to fraction
            learn_table[count].set_avg(table[count]);
        } else {
            no = sscanf_s(p, "%lf%n", table + count, &cread);
            if(no != 1) break;
            p += cread;
            switch(*p) {
                case 'M':
                    table[count] *= 1e6;
                    break;
                case 'k':
                    table[count] *= 1e3;
                    break;
                case 'm':
                    table[count] /= 1e3;
                    break;
                case 'u':
                    table[count] /= 1e6;
                    break;
                case 'n':
                    table[count] /= 1e9;
                    break;
                case 'p':
                    table[count] /= 1e12;
                    break;
            }
            learn_table[count].set_avg(table[count]);
        }

        p = strtok_s(NULL, sep, &next_token);
        count++;
    };

    steps = count;
    step_enabled[nom_step] = true; // always enable default step
    learned_start_step = nom_step;

    delete [] trim_table; trim_table = NULL;
}

void TRIM_NODE::execute(void(*measure_func)(TRIM_NODE *trim_node, TREG_MEASURE_FLAG treg_measure_flag, double *results),
                        int tnum_prod, int tnum_char, int log_level, double trim_hysteresis_pcnt, unsigned max_retry_cnt) {

    unsigned step = 0;
    double meas_results[MS_MAX_SITES];
    double char_results[MAX_TRIM][MS_MAX_SITES];

    if(tnum_prod < 0) {
        TREG_ERROR::error("TREG: Production test number not set up for TRIM '%s'.", get_name());
        return;
    }

    if(tnum_char > 0 && table_char_active()) {
        char buf[STEP_STR_BUF_SIZE];
        save_working();
        LOOP_STEPS(step) {
            set_working(step);
            measure_func(this, TREG_MEASURE_CHAR, meas_results);
            TREG_SERIAL {
                if(TREG::simulator()) {
                    if(trim_rel_mode)
                        meas_results[TSITE] = get_target(TSITE) * get_table_value(step);
                    else
                        meas_results[TSITE] = get_target(TSITE) + get_table_value(step);
                }
                table_char(meas_results[TSITE], step, TSITE);
                char_results[step][TSITE] = meas_results[TSITE];
                _snprintf_s(buf, STEP_STR_BUF_SIZE, "%d", step);
                TREG_LOG::log_data(tnum_char, step, meas_results[TSITE], TSITE, use_msLogData, true, (string)get_name() + "_char_step_" + (string)buf);
            }
        }
        restore_working();

        LOGLEVEL(TREG_LOG_TABLE) {
            double table_value;
            unsigned tnum = use_msLogData ? tnum_char + 1 : tnum_char + get_steps();
            LOOP_STEPS(step) {
                TREG_SERIAL {
                    if(trim_rel_mode) // Relative trim table
                        table_value = ((char_results[step][TSITE] / char_results[get_start(TSITE)][TSITE]) - 1.0);
                    else              // Absolute trim table
                        table_value = ((char_results[step][TSITE] - char_results[get_start(TSITE)][TSITE]));
                    _snprintf_s(buf, STEP_STR_BUF_SIZE, "%d", step);
                    TREG_LOG::log_data(tnum, step, table_value, TSITE, use_msLogData, true, (string)get_name() + "_char_table_" + (string)buf);
                }
            }
        }

        LOGLEVEL(TREG_LOG_DEBUG) {
            double table_value, previous_value, diff, diff_pcnt;
            double scientific_notation_threshold = 1e-2; // if value is smaller than scientific_notation_threshold switch to e.g. 2.39e-6
            TREG_SERIAL {
                previous_value = char_results[0][TSITE];
                PRINT("\n");
                PRINT("--------------------------------------------------------------------\n");
                PRINT("SITE %d  %s \n", TSITE + 1, get_name());
                PRINT("--------------------------------------------------------------------\n");
                PRINT("%10s%14s%15s%14s%15s\n", "", "Result", "Table", "Delta abs", "Delta rel");
                LOOP_STEPS(step) {
                    diff_pcnt = (char_results[step][TSITE] / previous_value - 1.0) * 100;
                    diff = char_results[step][TSITE] - previous_value;
                    previous_value = char_results[step][TSITE];
                    PRINT("step %3d: ", step);
                    if((fabs(char_results[step][TSITE]) < scientific_notation_threshold) && (char_results[step][TSITE] != 0.0))
                        PRINT("%14.2e", char_results[step][TSITE]);
                    else
                        PRINT("%14.4f", char_results[step][TSITE]);
                    if(trim_rel_mode) { // Relative trim table
                        table_value = ((char_results[step][TSITE] / char_results[get_start(TSITE)][TSITE]) - 1.0) * 100;
                        PRINT("%+14.2f%%", table_value);
                    } else {            // Absolute trim table
                        table_value = ((char_results[step][TSITE] - char_results[get_start(TSITE)][TSITE]));
                        if((fabs(table_value) < scientific_notation_threshold) && (table_value != 0.0))
                            PRINT("%+15.2e", table_value);
                        else
                            PRINT("%+15.4f", table_value);
                    }
                    if((fabs(diff) < scientific_notation_threshold) && (diff != 0.0))
                        PRINT("%+14.2e", diff);
                    else
                        PRINT("%+14.4f", diff);
                    PRINT("%+14.2f%%\n", diff_pcnt);
                }
                PRINT("--------------------------------------------------------------------\n\n");
            }
        }
    }

    // if trimming is disabled use values from 'programmed' for pre measurement
    TREG_SERIAL {
        if(!trim_is_active[TSITE])
            copy_prog_to_work(TSITE);
    }

    // pre trim measurement
    measure_func(this, TREG_MEASURE_PRE, meas_results);

    TREG_SERIAL {
        if(TREG::simulator()) {
            if(trim_rel_mode)
                meas_results[TSITE] = get_target(TSITE) * get_table_value(get_working(TSITE));
            else
                meas_results[TSITE] = get_target(TSITE) + get_table_value(get_working(TSITE));
        }
        TREG_LOG::log_data(tnum_prod, 0, get_working(TSITE),  TSITE, use_msLogData, true, (string)get_name() + "_pre_step", 0.0, steps - 1, "#"); // log pre trimming step
        TREG_LOG::log_data(tnum_prod, 1, meas_results[TSITE], TSITE, use_msLogData, false);                                                       // log pre trimming result
    };

    pre(meas_results, trim_hysteresis_pcnt);

    // post trim measurement if necessary
    if(updated_by_trim()) {
        measure_func(this, TREG_MEASURE_POST, meas_results);
    }

    // retry trimming if max_retry_cnt > 0. This might be beneficial if the initial trim attempt 
    // found a post step which is far away from the default step.
    retry_cnt = 0;
    for(unsigned i = 0; i < max_retry_cnt; i++) {
        pre(meas_results, trim_hysteresis_pcnt); // call pre() again with post meas_results values
        if(updated_by_trim()) {
            retry_cnt++;
            measure_func(this, TREG_MEASURE_RETRY, meas_results);
        } else {
            break; // for loop if step wasn't changed -> no better step found
        }
    }

    TREG_SERIAL {
        if(TREG::simulator()) {
            if(trim_rel_mode)
                meas_results[TSITE] = get_target(TSITE) * get_table_value(get_working(TSITE));
            else
                meas_results[TSITE] = get_target(TSITE) + get_table_value(get_working(TSITE));
        }
        TREG_LOG::log_data(tnum_prod,     2, get_working(TSITE),       TSITE, use_msLogData, true, (string)get_name() + "_post_step", 0.0, steps - 1, "#"); // log post trimming step
        TREG_LOG::log_data(tnum_prod,     3, updated_by_trim(TSITE),   TSITE, use_msLogData, true, (string)get_name() + "_updated"  , 0.0, 1.0,       "#"); // log updated_by_trim() flag
        TREG_LOG::log_data(tnum_prod,     4, get_guessed_final(TSITE), TSITE, use_msLogData, true, (string)get_name() + "_post_calc");                      // log predicted result
        TREG_LOG::log_data(tnum_prod,     5, get_target(TSITE),        TSITE, use_msLogData, true, (string)get_name() + "_target");                         // log target
        TREG_LOG::log_data(tnum_prod + 1, 5, meas_results[TSITE],      TSITE, use_msLogData, false); // log post trimming result
        LOGLEVEL(TREG_LOG_DELTA) {
            double delta_to_target_abs = meas_results[TSITE] - get_target(TSITE);
            double delta_to_target_rel = (meas_results[TSITE] - get_target(TSITE)) / get_target(TSITE);
            TREG_LOG::log_data(tnum_prod + 2, 5, delta_to_target_abs,  TSITE, use_msLogData, false); // log absolute delta to target
            TREG_LOG::log_data(tnum_prod + 3, 5, delta_to_target_rel,  TSITE, use_msLogData, false); // log relative delta to target
        }
        // add additional logging here to keep compatibility with existing test lists
    };

    post(meas_results);
}

// lzg
void TRIM_NODE::execute(void(*measure_func)(TRIM_NODE *trim_node, TREG_MEASURE_FLAG treg_measure_flag, double *results),
                        SPEC& spec, short funcindex, LPCTSTR funclabel, double unit_scale) {

    unsigned step = 0;
    double meas_results[MS_MAX_SITES];
    double char_results[MAX_TRIM][MS_MAX_SITES];

	//if(1)
    if(table_char_active()) 
	{
        //char buf[STEP_STR_BUF_SIZE];
        save_working();
        LOOP_STEPS(step) {
            set_working(step);
            measure_func(this, TREG_MEASURE_CHAR, meas_results);
            TREG_SERIAL {
                table_char(meas_results[TSITE], step, TSITE);
                char_results[step][TSITE] = meas_results[TSITE];
				if(spec.get_step_str(funclabel, step) != "error")
				StsGetParam(funcindex,spec.get_step_str(funclabel, step).c_str())->SetTestResult(TSITE, 0, meas_results[TSITE] * unit_scale);
            }
        }
        restore_working();
    }

    // if trimming is disabled use values from 'programmed' for pre measurement
    TREG_SERIAL {
        if(!trim_is_active[TSITE])
            copy_prog_to_work(TSITE);
    }

    // pre trim measurement
    measure_func(this, TREG_MEASURE_PRE, meas_results);

    TREG_SERIAL {
		if(spec.get_pre_str(funclabel) != "error")
		StsGetParam(funcindex,spec.get_pre_str(funclabel).c_str())->SetTestResult(TSITE, 0, meas_results[TSITE] * unit_scale);		// log pre trimming result
		if(spec.get_pre_bit_str(funclabel) != "error")
		StsGetParam(funcindex,spec.get_pre_bit_str(funclabel).c_str())->SetTestResult(TSITE, 0, get_working(TSITE));				// log pre trimming step
    };

	pre(meas_results);
    // post trim measurement if necessary
	if(!QC && DO_TRIM){
		if(updated_by_trim()) {
			measure_func(this, TREG_MEASURE_POST, meas_results);
		}
	}
	post(meas_results);

    TREG_SERIAL {
		if(spec.get_post_str(funclabel) != "error")
 		StsGetParam(funcindex,spec.get_post_str(funclabel).c_str())->SetTestResult(TSITE, 0, meas_results[TSITE] * unit_scale);			// log post trimming result
		if(spec.get_post_bit_str(funclabel) != "error")
 		StsGetParam(funcindex,spec.get_post_bit_str(funclabel).c_str())->SetTestResult(TSITE, 0, get_working(TSITE));					// log post trimming step
		if(spec.get_target_str(funclabel) != "error")
 		StsGetParam(funcindex,spec.get_target_str(funclabel).c_str())->SetTestResult(TSITE, 0, get_target(TSITE) * unit_scale);			// log target
		if(spec.get_guessed_str(funclabel) != "error")
 		StsGetParam(funcindex,spec.get_guessed_str(funclabel).c_str())->SetTestResult(TSITE, 0, get_guessed_final(TSITE) * unit_scale);	// log predicted result
		if(spec.get_updated_str(funclabel) != "error")
 		StsGetParam(funcindex,spec.get_updated_str(funclabel).c_str())->SetTestResult(TSITE, 0, updated_by_trim(TSITE));				// log updated_by_trim() flag
    };

}

///////////////////////////////////////////////////////////////////////////////
// TRIM class
TRIM::TRIM() {
    init();
}

TRIM::~TRIM() {

}

void TRIM::init() {
    number_of_test_runs = 0;
    treg_site = 0;
    num_units_sublot = 0;
    char_on_wafer_change = false;
}

void TRIM::set_trim_allowed(bool turn_on, int site) {
    CHECK_SITE_EXIT
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    }

    for(unsigned i = 0; i < count(); i++)
        (*this)[i].set_trim_allowed(turn_on, site);
}

void TRIM::force_table_char_active(bool activate) {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    }

    for(unsigned i = 0; i < count(); i++)
        (*this)[i].force_table_char_active(activate);
}

void TRIM::set_table_char_active(bool activate) {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    }

    for(unsigned i = 0; i < count(); i++)
        (*this)[i].set_table_char_active(activate);
}

void TRIM::set_learn_trim_start(unsigned value) {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    }

    for(unsigned i = 0; i < count(); i++)
        (*this)[i].set_learn_trim_start(value);
}

void TRIM::set_learn_trim_step(unsigned value) {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    }

    for(unsigned i = 0; i < count(); i++)
        (*this)[i].set_learn_trim_step(value);
}

void TRIM::set_learn_trim_char(unsigned value) {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    }

    for(unsigned i = 0; i < count(); i++)
        (*this)[i].set_learn_trim_char(value);
}

void TRIM::force_post_measurement(bool activate) {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    }

    for(unsigned i = 0; i < count(); i++)
        (*this)[i].force_post_measurement(activate);
}

bool TRIM::start_learn_valid() {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return false;
    }

    for(unsigned i = 0; i < count(); i++)
        if(!(*this)[i].start_learn_valid())
            return false;

    return true;
}

bool TRIM::table_char_active() {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return false;
    }

    for(unsigned i = 0; i < count(); i++)
        if((*this)[i].table_char_active())
            return true;

    return false;
}

void TRIM::restart_table_char() {
    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    }

    for(unsigned i = 0; i < count(); i++)
        (*this)[i].restart_table_char();
}

void TRIM::sot() {
#ifdef TREG_ETS364
    if(TI_ShellIsProbeTest() && char_on_wafer_change) {
        // check if number of units in sublot decreased which indicates that wafer change happend
        int num = GetTestMainVariable(SUBLOT_DUTS_TESTED);
        if(num_units_sublot > num)
            restart_table_char();
        num_units_sublot = num;
    }
#endif
    TREG_LIST<TRIM_NODE>::sot();
}

void TRIM::eot() {
    TREG_LIST<TRIM_NODE>::eot();
    number_of_test_runs++;
}

void TRIM::print_learn_table() {

    char        file_name[500];
    unsigned    i;

    FILE        *file;

    if(!count()) {
        TREG_ERROR::error("TREG: No TRIM parameter defined.");
        return;
    } 

    for(unsigned j = 0; j < count(); j++) {
        TRIM_NODE &node = (*this)[j];

        sprintf_s(file_name, "%s.csv", node.name.c_str());

        if(node.print_learn_table_header) {
            fopen_s(&file, file_name, "w");

            if(file) {
                fprintf(file, "Insertion,Updated by trim,Table char #unit remaining,");
                for(i = 0; i < node.get_steps(); i++)
                    if(node.trim_step_enabled(i))
                        fprintf(file, "Trim Step %d,", i);

                TREG_SERIAL_ALL fprintf(file, ",,pre_bit [%d],"
                                        "pre_value [%d],"
                                        "post_bit [%d],"
                                        "guessed_value [%d],"
                                        "post_value [%d],"
                                        "predictability [%d]", TSITE, TSITE, TSITE, TSITE, TSITE, TSITE);
                fprintf(file, "\n\n");
                fclose(file);
                node.print_learn_table_header = false;
            }
        }

        fopen_s(&file, file_name, "a");

        if(file) {
            fprintf(file, "%d,", number_of_test_runs);
            fprintf(file, "%d,", node.updated_by_trim());
            fprintf(file, "%d,", node.table_char_units_remaining);
            for(i = 0; i < node.get_steps(); i++) {
                if(node.trim_step_enabled(i))
                    fprintf(file, "%.6g,", node.get_learn_table_value(i));
            }

#ifdef TREG_ETS364
            TREG_SERIAL_ALL {
                if(msSiteStat(TSITE)) {
                    fprintf(file, ",,%d,%.6g,%d,%.6g,%.6g,%.6g", node.get_start(TSITE),
                    node.get_pre_reading(TSITE),
                    node.get_programmed(TSITE),
                    node.get_guessed_final(TSITE),
                    node.get_post_reading(TSITE),
                    node.get_guessed_final(TSITE) - node.get_post_reading(TSITE));
                } else {
                    fprintf(file, ",,,,,,,");
                }
            }
#else
            TREG_SERIAL_ALL {
                fprintf(file, ",,%d,%.6g,%d,%.6g,%.6g,%.6g", node.get_start(TSITE),
                node.get_pre_reading(TSITE),
                node.get_programmed(TSITE),
                node.get_guessed_final(TSITE),
                node.get_post_reading(TSITE),
                node.get_guessed_final(TSITE) - node.get_post_reading(TSITE));
            }
#endif
            fprintf(file, "\n");
            fclose(file);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// TRIM_LINK class
TRIM_LINK::TRIM_LINK() {
    link = new TRIM_NODE;
    link_default = true;
    tnum_prod = -1;
    tnum_char = -1;
}

TRIM_LINK::~TRIM_LINK() {
    if(link_default) {
        delete link;
        link = NULL;
    }
}

void TRIM_LINK::set_spec(double low_spec, double up_spec) {
    lower_spec_limit = low_spec;
    upper_spec_limit = up_spec;
    calc_norm_parameters();
}

#ifdef TREG_ETS364
void TRIM_LINK::set_spec(int test_list_test_number) {
    if(!get_limits(test_list_test_number, &lower_spec_limit, &upper_spec_limit)) {
        TREG_ERROR::error("TREG: set_spec(): Test number '%d' doesn't exist.", test_list_test_number);
        return;
    }
    this->link->set_target((lower_spec_limit + upper_spec_limit) / 2.0);
    calc_norm_parameters();
}

void TRIM_LINK::set_test_num(int prod_test_number, int char_test_number) {
    if(!get_limits(prod_test_number)) {
        TREG_ERROR::error("TREG: set_test_num(): Test number '%d' doesn't exist.", prod_test_number);
        return;
    }

    if(char_test_number > 0 && !get_limits(char_test_number)) {
        TREG_ERROR::error("TREG: set_test_num(): Test number '%d' doesn't exist.", char_test_number);
        return;
    }
    tnum_prod = prod_test_number;
    tnum_char = char_test_number;
}
#endif

void TRIM_LINK::set_lower_spec(double low_spec) {
    lower_spec_limit = low_spec;
    calc_norm_parameters();
}

void TRIM_LINK::set_upper_spec(double up_spec) {
    upper_spec_limit = up_spec;
    calc_norm_parameters();
}

void TRIM_LINK::calc_norm_parameters() {
    norm_offset = (upper_spec_limit + lower_spec_limit) / 2.0;
    norm_factor = 2.0 / (upper_spec_limit - lower_spec_limit);
}

double TRIM_LINK::normalize_value_squared(double value) {
    double normalize_value = (value - norm_offset) * norm_factor;
    return normalize_value * normalize_value;
}

double TRIM_LINK::get_normalized_error_squared(int site) {
    CHECK_SITE_EXIT_0
    double normalize_value = (link->calc_estimate(site, link->get_working(site)) - norm_offset) * norm_factor;
    return normalize_value * normalize_value;
}

void TRIM_LINK::recursive(TRIM_GRP_NODE *trim_node, double *smallest_error, TrimGrpErrorFunc user_error_func, int site) {
    CHECK_SITE_EXIT
    unsigned i;
    double   old_error = FLT_MAX;
    double   temp_error = FLT_MAX;

    for(i = 0; i < link->get_steps(); i++) {
        if(link->trim_step_enabled(i)) {
            this->link->set_working(i, site);

            if(next_node && next_node->valid) {
                // there are still lower levels availabe ------------------------------------------------------
                old_error = *smallest_error;    // required to see if smaller error was found in lower levels
                next_node->recursive(trim_node, smallest_error, user_error_func, site);

                // update "min_error" and internal_storage if setting with smaller error was found in lower levels
                if(fabs(old_error) > fabs(*smallest_error)) {
                    old_error = *smallest_error;
                    link->internal_storage[site] = link->get_working(site);
                }
            } else {
                // lowest level is reached --------------------------------------------------------------------
                temp_error = user_error_func(*trim_node, site);

                // update "min_error" and internal_storage if setting with smaller error was found
                if(fabs(temp_error) < fabs(*smallest_error)) {
                    *smallest_error = temp_error;
                    link->internal_storage[site] = link->get_working(site);
                }
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// TRIM_GRP_NODE class
TRIM_GRP_NODE::TRIM_GRP_NODE() {
    treg_site = 0;
    retry_cnt = 0;
}

TRIM_GRP_NODE::~TRIM_GRP_NODE() {

}

void TRIM_GRP_NODE::pre() {
    this->pre(&default_trim_grp_error_func);
}

void TRIM_GRP_NODE::pre(TrimGrpErrorFunc user_error_func) {

    if(count()) {
        TREG_SERIAL {
            // Calc all estimated values ------------------------------------------------
            for(unsigned i = 0; i < count(); i++) {
                TRIM_NODE &trim = (*this)[i];
                for(unsigned j = 0; j < trim.get_steps(); j++) {
                    if(trim.step_enabled[j])
                        trim.set_guessed_final(trim.calc_estimate(TSITE, j), TSITE, j);
                }
            }

            if(!is_linked_group) { // Go through ALL possible bit combination (steps_Param_1 * steps_Param_2 * ..... * steps_Param_n)
                double min_error = FLT_MAX;
                root_node->recursive(this, &min_error, user_error_func, TSITE);

                // update trim parameters to reflect settings with smallest error -------
                for(unsigned i = 0; i < count(); i++) {
                    TRIM_NODE &trim = (*this)[i];
                    if(trim.get_trim_allowed(TSITE))
                        trim.set_working(trim.internal_storage[TSITE], TSITE); // update working with best setting
                    else
                        trim.set_working(trim.programmed[TSITE],       TSITE); // update working with best setting

                    // check if working has changed ----------------
                    trim.trim_value_changed[TSITE] = (trim.pre_trimming[TSITE] != trim.working[TSITE]) ? true : false;
                }
            } else { // TRIM Parameters are linked -> go only through steps of the FIRST parameter
                double   min_error     = FLT_MAX;
                double   current_error = FLT_MAX;
                unsigned best_step     = 0;
                unsigned i;

                // Trimmng is ACTIVE -> loop through steps of FIRST parameter and find smallest error returned by user_error_func
                if((*this)[0].get_trim_allowed(TSITE)) {
                    for(i = 0; i < (*this)[0].get_steps(); i++) {
                        if((*this)[0].step_enabled[i]) {
                            for(unsigned j = 0; j < count(); j++)(*this)[j].set_working(i, TSITE);  // set working of all Trim Parameters in Group to the same value

                            current_error = user_error_func(*this, TSITE);

                            if(current_error < min_error) {
                                min_error = current_error;
                                best_step = i;
                            }
                        }
                    }

                    for(i = 0; i < count(); i++) {
                        TRIM_NODE &trim = (*this)[i];
                        trim.set_working(best_step, TSITE);    // set working of all Trim Parameters in Group to the best step
                        trim.trim_value_changed[TSITE] = (trim.pre_trimming[TSITE] != trim.working[TSITE]) ? true : false;
                    }
                } else { // Trimming is DEACTIVATED -> copy programmed to working
                    unsigned programmed = (*this)[0].programmed[TSITE];
                    for(i = 0; i < count(); i++) {
                        TRIM_NODE &trim = (*this)[i];
                        trim.set_programmed(programmed, TSITE);
                        trim.copy_prog_to_work(TSITE); // update working with best setting
                        trim.trim_value_changed[TSITE] = (trim.pre_trimming[TSITE] != trim.working[TSITE]) ? true : false;
                    }
                }
            }
        }
    }
}

bool TRIM_GRP_NODE::updated_by_trim(int site) {

    CHECK_SITE_EXIT_0

    bool update = false;
    unsigned i;

    if(site == MS_ALL) { // all sites
        TREG_SERIAL {
            if(!is_linked_group) {
                for(i = 0; i < count(); i++) {
                    TRIM_NODE &trim = (*this)[i];
                    if(trim.updated_by_trim(TSITE))
                        update = true;
                }
            } else {
                TRIM_NODE &trim = (*this)[0];
                if(trim.updated_by_trim(TSITE))
                    update = true;
            }
        }
    } else { // single site
        if(!is_linked_group) {
            for(i = 0; i < count(); i++) {
                TRIM_NODE &trim = (*this)[i];
                if(trim.updated_by_trim(site))
                    update = true;
            }
        } else {
            TRIM_NODE &trim = (*this)[0];
            if(trim.updated_by_trim(site))
                update = true;
        }
    }
    return update;
}

TRIM_LINK &TRIM_GRP_NODE::operator()(unsigned index) {
    return TREG_LIST<TRIM_LINK>::operator [](index);
}

TRIM_NODE &TRIM_GRP_NODE::operator[](unsigned index) {
    return (*TRIM_GRP_NODE::operator()(index).link);
}

void TRIM_GRP_NODE::execute(void(*measure_func)(TRIM_GRP_NODE *trim_grp_node, TREG_MEASURE_FLAG treg_measure_flag,
                            TREG_RESULTS &meas_results), int log_level,
                            TrimGrpErrorFunc user_error_func, double trim_hysteresis_pcnt, unsigned max_retry_cnt) {

    bool table_char_active = false;
    unsigned i, step = 0, max_steps = 0;

    TREG_RESULTS meas_results(count(), vector<double>(TREG::num_sites(), 0.0)); // 2 dimensional array

    for(i = 0; i < count(); i++) {
        TRIM_NODE &trim = (*this)[i];
        trim.save_working();                            // backup working
        if(trim.get_steps() > max_steps)                // find out higest number of trim steps in group
            max_steps = trim.get_steps();

        table_char_active |= trim.table_char_active();  // find out if table char is enabled at least for one TRIM parameter
    }

    if(table_char_active) {
        for(step = 0; step < max_steps; step++) {
            for(i = 0; i < count(); i++) {  // set working for every trim
                TRIM_NODE &trim = (*this)[i];
                if(step < trim.get_steps())
                    trim.set_working(step); // clamp working to the highest trim step
            }

            measure_func(this, TREG_MEASURE_CHAR, meas_results); // measure all parameters in group at once

            // fill results into learn_table
            for(i = 0; i < count(); i++) {
                TRIM_NODE &trim = (*this)[i];
                TRIM_LINK &trim_link = (*this)(i);
                if(trim_link.tnum_char > 0 && trim.table_char_active() && trim.step_enabled[step] && step < trim.get_steps()) {
                    TREG_SERIAL {
                        if(TREG::simulator()) {
                            if(trim.trim_rel_mode)
                                meas_results[i][TSITE] = trim.get_target(TSITE) * trim.get_table_value(step);
                            else
                                meas_results[i][TSITE] = trim.get_target(TSITE) + trim.get_table_value(step);
                        }
                        trim.table_char(meas_results[i][TSITE], step, TSITE);
                    }
                }
            }
        }

        // datalog results (done here to avoid alternating datalogging of each trim parameter)
        for(i = 0; i < count(); i++) {
            char buf[STEP_STR_BUF_SIZE];
            TRIM_NODE &trim = (*this)[i];
            TRIM_LINK &trim_link = (*this)(i);
            if(trim_link.tnum_char > 0 && trim.table_char_active()) {
                for(step = 0; step < trim.get_steps(); step++) {
                    if(trim.step_enabled[step]) {
                        _snprintf_s(buf, STEP_STR_BUF_SIZE, "%d", step);
                        TREG_SERIAL TREG_LOG::log_data(trim_link.tnum_char, step, trim.learn_table[step].get_char_table_value(TSITE), TSITE, 
                                                       trim.use_msLogData, true, (string)trim.get_name() + "_char_step_" + (string)buf);
                        LOGLEVEL(TREG_LOG_TABLE) {
                            TREG_SERIAL {
                                double table_value;
                                double value = trim.learn_table[step].get_char_table_value(TSITE);
                                double start_value = trim.learn_table[trim.get_start(TSITE)].get_char_table_value(TSITE);
                                if(trim.trim_rel_mode) // Relative trim table
                                    table_value = ((value / start_value) - 1.0);
                                else                   // Absolute trim table
                                    table_value = (value - start_value);
                                _snprintf_s(buf, STEP_STR_BUF_SIZE, "%d", step);
                                unsigned tnum = trim.use_msLogData ? trim_link.tnum_char + 1 : trim_link.tnum_char + trim.get_steps();
                                TREG_LOG::log_data(tnum, step, table_value, TSITE, trim.use_msLogData, true, (string)trim.get_name() + "_char_table_" + (string)buf);
                            }
                        }
                    }
                }
            }
        }

        for(i = 0; i < count(); i++) {
            TRIM_NODE &trim = (*this)[i];
            trim.restore_working(); // restore working for every trim
        }

        LOGLEVEL(TREG_LOG_DEBUG) {
            TREG_SERIAL {
                double table_value, previous_value, current_value, diff, diff_pcnt;
                double scientific_notation_threshold = 1e-2; // if value is smaller than scientific_notation_threshold switch to e.g. 2.39e-6
                for(i = 0; i < count(); i++) {
                    TRIM_NODE &trim = (*this)[i];
                    previous_value = trim.learn_table[0].get_char_table_value(TSITE);
                    PRINT("\n");
                    PRINT("--------------------------------------------------------------------\n");
                    PRINT("SITE %d GROUP %s TRIM %s \n", TSITE + 1, get_name(), trim.get_name());
                    PRINT("--------------------------------------------------------------------\n");
                    PRINT("%10s%14s%15s%14s%15s\n", "", "Result", "Table", "Delta abs", "Delta rel");
                    for(step = 0; step < trim.get_steps(); step++) {
                        if(trim.step_enabled[step]) {
                            current_value = trim.learn_table[step].get_char_table_value(TSITE);
                            diff_pcnt = (current_value / previous_value - 1.0) * 100;
                            diff = current_value - previous_value;
                            previous_value = current_value;
                            PRINT("step %3d: ", step);
                            if((fabs(current_value) < scientific_notation_threshold) && (current_value != 0.0))
                                PRINT("%14.2e", current_value);
                            else
                                PRINT("%14.4f", current_value);
                            if(trim.trim_rel_mode) { // Relative trim table
                                table_value = ((current_value / trim.learn_table[trim.get_start(TSITE)].get_char_table_value(TSITE)) - 1.0) * 100;
                                PRINT("%+14.2f%%", table_value);
                            } else {                 // Absolute trim table
                                table_value = ((current_value - trim.learn_table[trim.get_start(TSITE)].get_char_table_value(TSITE)));
                                if((fabs(table_value) < scientific_notation_threshold) && (table_value != 0.0))
                                    PRINT("%+15.2e", table_value);
                                else
                                    PRINT("%+15.4f", table_value);
                            }
                            if((fabs(diff) < scientific_notation_threshold) && (diff != 0.0))
                                PRINT("%+14.2e", diff);
                            else
                                PRINT("%+14.4f", diff);
                            PRINT("%+14.2f%%\n", diff_pcnt);
                        }
                    }
                    PRINT("--------------------------------------------------------------------\n\n");
                }
            }
        }
    }

    // if trimming is disabled use values from 'programmed' for pre measurement
    for(i = 0; i < count(); i++) {
        TREG_SERIAL {
            TRIM_NODE &trim = (*this)[i];
            if(!trim.trim_is_active[TSITE])
                trim.copy_prog_to_work(TSITE);
        }
    }

    // pre trim measurement
    measure_func(this, TREG_MEASURE_PRE, meas_results);

    TREG_SERIAL {
        for(i = 0; i < count(); i++) {
            TRIM_NODE &trim = (*this)[i];
            TRIM_LINK &trim_link = (*this)(i);
            int tnum_prod = trim_link.tnum_prod;

            if(tnum_prod < 0) {
                TREG_ERROR::error("TREG: Production test number not set up for TRIM '%s' in TRIM_GRP '%s'.", trim.get_name(), get_name());
                return;
            }

            if(TREG::simulator()) {
                if(trim.trim_rel_mode)
                    meas_results[i][TSITE] = trim.get_target(TSITE) * trim.get_table_value(trim.get_working(TSITE));
                else
                    meas_results[i][TSITE] = trim.get_target(TSITE) + trim.get_table_value(trim.get_working(TSITE));
            }

            TREG_LOG::log_data(tnum_prod, 0, trim.get_working(TSITE), TSITE, trim.use_msLogData, true, (string)trim.get_name() + "_pre_step", 0.0, trim.get_steps() - 1, "#"); // log pre trimming step
            TREG_LOG::log_data(tnum_prod, 1, meas_results[i][TSITE],  TSITE, trim.use_msLogData, false);                                                                       // log pre trimming result

            if(is_measure_group)
                trim.pre(meas_results[i][TSITE], TSITE, trim_hysteresis_pcnt);
            else
                trim.set_pre_reading(meas_results[i][TSITE], TSITE);
        }
    };

    if(!is_measure_group) {
        if(user_error_func)
            pre(user_error_func);
        else
            pre();
    }

    // post trim measurement if necessary
    if(updated_by_trim()) {
        measure_func(this, TREG_MEASURE_POST, meas_results);
    }

    // retry trimming if max_retry_cnt > 0. This might be beneficial if the initial trim attempt 
    // found a post step which is far away from the default step.
    retry_cnt = 0;
    for(i = 0; i < max_retry_cnt; i++) {
        TRIM_NODE &trim = (*this)[i];
        // call pre() again with post meas_results values
        TREG_SERIAL {
            for(i = 0; i < count(); i++) {
                if(is_measure_group)
                    trim.pre(meas_results[i][TSITE], TSITE, trim_hysteresis_pcnt);
                else
                    trim.set_pre_reading(meas_results[i][TSITE], TSITE);
            }
        };

        if(!is_measure_group) {
            if(user_error_func)
                pre(user_error_func);
            else
                pre();
        }

        if(updated_by_trim()) {
            retry_cnt++;
            measure_func(this, TREG_MEASURE_RETRY, meas_results);
        } else {
            break; // for loop if step wasn't changed -> no better step found
        }
    }

    TREG_SERIAL {
        for(i = 0; i < count(); i++) {
            TRIM_NODE &trim = (*this)[i];
            TRIM_LINK &trim_link = (*this)(i);
            int tnum_prod = trim_link.tnum_prod;
            if(TREG::simulator()) {
                if(trim.trim_rel_mode)
                    meas_results[i][TSITE] = trim.get_target(TSITE) * trim.get_table_value(trim.get_working(TSITE));
                else
                    meas_results[i][TSITE] = trim.get_target(TSITE) + trim.get_table_value(trim.get_working(TSITE));
            }
            TREG_LOG::log_data(tnum_prod,     2, trim.get_working(TSITE),       TSITE, trim.use_msLogData, true, (string)trim.get_name() + "_post_step", 0.0, trim.get_steps() - 1, "#");   // log post trimming step
            TREG_LOG::log_data(tnum_prod,     3, trim.updated_by_trim(TSITE),   TSITE, trim.use_msLogData, true, (string)trim.get_name() + "_updated"  , 0.0, 1.0,                  "#");   // log updated_by_trim() flag
            TREG_LOG::log_data(tnum_prod,     4, trim.get_guessed_final(TSITE), TSITE, trim.use_msLogData, true, (string)trim.get_name() + "_post_calc");                                   // log predicted result
            TREG_LOG::log_data(tnum_prod,     5, trim.get_target(TSITE),        TSITE, trim.use_msLogData, true, (string)trim.get_name() + "_target");                                      // log target
            TREG_LOG::log_data(tnum_prod + 1, 5, meas_results[i][TSITE],        TSITE, trim.use_msLogData, false); // log post trimming result
            LOGLEVEL(TREG_LOG_DELTA) {
                double delta_to_target_abs = meas_results[i][TSITE] - trim.get_target(TSITE);
                double delta_to_target_rel = (meas_results[i][TSITE] - trim.get_target(TSITE)) / trim.get_target(TSITE);
                TREG_LOG::log_data(tnum_prod + 2, 5, delta_to_target_abs,       TSITE, trim.use_msLogData, false); // log absolute delta to target
                TREG_LOG::log_data(tnum_prod + 3, 5, delta_to_target_rel,       TSITE, trim.use_msLogData, false); // log relative delta to target
            }
            // add additional logging here to keep compatibility with existing test lists

            trim.post(meas_results[i][TSITE], TSITE);
        }
    };
}

///////////////////////////////////////////////////////////////////////////////
// TRIM_GRP class
TRIM_GRP::TRIM_GRP() {

}

TRIM_GRP::~TRIM_GRP() {

}

///////////////////////////////////////////////////////////////////////////////
// SEL_NODE class
SEL_NODE::SEL_NODE() {

}

SEL_NODE::~SEL_NODE() {

}

void SEL_NODE::set_start(unsigned value, int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL start[TSITE] = value;
    } else {
        CHECK_SITE_EXIT
        start[site] = value;
    }
}

void SEL_NODE::sot() {
    TREG_SERIAL_ALL {
        working[TSITE] = start[TSITE];
        programmed[TSITE] = 0;
        read_back[TSITE] = 0;
        saved[TSITE] = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////
// SEL class
SEL::SEL() {

}

SEL::~SEL() {

}

///////////////////////////////////////////////////////////////////////////////
// ASSY_BIT class
ASSY_BIT::ASSY_BIT() {
    link = new STORAGE;
    link_default = true;
    treg_site = 0;
}

ASSY_BIT::~ASSY_BIT() {
    if(link_default) {
        delete link;
        link = 0;
    }
}

void ASSY_BIT::init(unsigned assy_bit_pos, const char *param_bit_info) {
    bool invert_bit = false;
    unsigned bit_pos_param;

    if(strrchr(param_bit_info, '!'))
        invert_bit = true;

    while(!isdigit(*param_bit_info) && *param_bit_info) param_bit_info++;  // to ignore characters
    sscanf_s(param_bit_info, "%d", &bit_pos_param);

    pos_in_assy = assy_bit_pos;
    assy_mask = (INT64)1 << (INT64)assy_bit_pos;  // important: Casting to INT64, otherwise problems if assy is longer that 31 bits
    pos_in_param = bit_pos_param;
    param_mask = (unsigned)1 << (unsigned)bit_pos_param;
    invert_bits = invert_bit;
}

INT64 ASSY_BIT::get_working(int site) {
    CHECK_SITE_EXIT_0

    unsigned temp;

    temp = link->get_working(site) & param_mask;
    if(invert_bits) temp ^= param_mask;

    return temp ? 1 : 0;
}

INT64 ASSY_BIT::get_programmed(int site) {
    CHECK_SITE_EXIT_0

    unsigned temp;

    temp = link->get_programmed(site) & param_mask;
    if(invert_bits) temp ^= param_mask;

    return temp ? 1 : 0;
}


INT64 ASSY_BIT::get_read_back(int site) {
    CHECK_SITE_EXIT_0

    unsigned temp;

    temp = link->get_read_back(site) & param_mask;
    if(invert_bits) temp ^= param_mask;

    return temp ? 1 : 0;
}


INT64 ASSY_BIT::get_saved(int site) {
    CHECK_SITE_EXIT_0

    unsigned temp;

    temp = link->get_saved(site) & param_mask;
    if(invert_bits) temp ^= param_mask;

    return temp ? 1 : 0;
}

INT64 ASSY_BIT::get_start(int site) {
    CHECK_SITE_EXIT_0

    unsigned temp;

    temp = link->get_start(site) & param_mask;
    if(invert_bits) temp ^= param_mask;

    return temp ? 1 : 0;
}

void ASSY_BIT::set_working(INT64 value, int site) {

    CHECK_SITE_EXIT

    unsigned inv_param_mask = UINT_MAX - param_mask;

    value = value ? 1 : 0;  // convert INT64 to "boolian"
    if(invert_bits) value ^= 1;

    if(site == MS_ALL) {
        TREG_SERIAL_ALL {
            link->set_working(link->get_working(TSITE)&inv_param_mask, TSITE);    // clear bit
            if(value)
                link->set_working(link->get_working(TSITE) | param_mask, TSITE);  // set bit
        }
    } else {
        link->set_working(link->get_working(site)&inv_param_mask, site);         // clear bit
        if(value)
            link->set_working(link->get_working(site) | param_mask, site);   // set bit
    }
}

void ASSY_BIT::set_programmed(INT64 value, int site) {

    CHECK_SITE_EXIT

    unsigned inv_param_mask = UINT_MAX - param_mask;

    value = value ? 1 : 0;  // convert INT64 to "boolian"
    if(invert_bits) value ^= 1;

    if(site == MS_ALL) {
        TREG_SERIAL_ALL {
            link->set_programmed(link->get_programmed(TSITE) & inv_param_mask, TSITE);  // clear bit
            if(value)
                link->set_programmed(link->get_programmed(TSITE) | param_mask, TSITE);  // set bit
        }
    } else {
        link->set_programmed(link->get_programmed(site) & inv_param_mask, site);  // clear bit
        if(value)
            link->set_programmed(link->get_programmed(site) | param_mask, site);  // set bit
    }
}

void ASSY_BIT::set_read_back(INT64 value, int site) {

    CHECK_SITE_EXIT

    unsigned inv_param_mask = UINT_MAX - param_mask;

    value = value ? 1 : 0;  // convert INT64 to "boolian"
    if(invert_bits) value ^= 1;

    if(site == MS_ALL) {
        TREG_SERIAL_ALL {
            link->set_read_back(link->get_read_back(TSITE) & inv_param_mask, TSITE);  // clear bit
            if(value)
                link->set_read_back(link->get_read_back(TSITE) | param_mask, TSITE);  // set bit
        }
    } else {
        link->set_read_back(link->get_read_back(site) & inv_param_mask, site);  // clear bit
        if(value)
            link->set_read_back(link->get_read_back(site) | param_mask, site);  // set bit
    }
}

void ASSY_BIT::set_saved(INT64 value, int site) {

    CHECK_SITE_EXIT

    unsigned inv_param_mask = UINT_MAX - param_mask;

    value = value ? 1 : 0;  // convert INT64 to "boolian"
    if(invert_bits) value ^= 1;

    if(site == MS_ALL) {
        TREG_SERIAL_ALL {
            link->set_saved(link->get_saved(TSITE) & inv_param_mask, TSITE);  // clear bit
            if(value)
                link->set_saved(link->get_saved(TSITE) | param_mask, TSITE);  // set bit
        }
    } else {
        link->set_saved(link->get_saved(site) & inv_param_mask, site);  // clear bit
        if(value)
            link->set_saved(link->get_saved(site) | param_mask, site);  // set bit
    }
}



void ASSY_BIT::save_programmed() {
    TREG_SERIAL_ALL set_saved(get_programmed(TSITE), TSITE);
}

void ASSY_BIT::save_working() {
    TREG_SERIAL_ALL set_saved(get_working(TSITE), TSITE);
}

void ASSY_BIT::save_read_back() {
    TREG_SERIAL_ALL set_saved(get_read_back(TSITE), TSITE);
}

void ASSY_BIT::restore_programmed() {
    TREG_SERIAL_ALL set_programmed(get_saved(TSITE), TSITE);
}

void ASSY_BIT::restore_working() {
    TREG_SERIAL_ALL set_working(get_saved(TSITE), TSITE);
}

void ASSY_BIT::restore_read_back() {
    TREG_SERIAL_ALL set_read_back(get_saved(TSITE), TSITE);
}

void ASSY_BIT::copy_prog_to_work(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_working(get_programmed(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_working(get_programmed(site), site);
    }
}

void ASSY_BIT::copy_read_to_work(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_working(get_read_back(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_working(get_read_back(site), site);
    }
}

void ASSY_BIT::copy_start_to_work(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_working(get_start(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_working(get_start(site), site);
    }
}

void ASSY_BIT::copy_work_to_prog(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_programmed(get_working(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_programmed(get_working(site), site);
    }
}

void ASSY_BIT::copy_read_to_prog(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_programmed(get_read_back(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_programmed(get_read_back(site), site);
    }
}

void ASSY_BIT::copy_start_to_prog(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_programmed(get_start(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_programmed(get_start(site), site);
    }
}

void ASSY_BIT::copy_work_to_read(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_read_back(get_working(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_read_back(get_working(site), site);
    }
}

void ASSY_BIT::copy_prog_to_read(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_read_back(get_programmed(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_read_back(get_programmed(site), site);
    }
}

void ASSY_BIT::copy_start_to_read(int site) {
    if(site == MS_ALL) {
        TREG_SERIAL_ALL set_read_back(get_start(TSITE), TSITE);
    } else {
        CHECK_SITE_EXIT
        set_read_back(get_start(site), site);
    }
}

///////////////////////////////////////////////////////////////////////////////
// ASSY
ASSY_NODE::ASSY_NODE() {
    treg_site = 0;
}

ASSY_NODE::~ASSY_NODE() {

}

INT64 ASSY_NODE::get_working(int site) {

    CHECK_SITE_EXIT_0

    INT64 temp_bit = 0;
    INT64 temp_assy = 0;
    int   shift_delta;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        temp_bit = pbit.link->get_working(site);
        temp_bit &= pbit.param_mask;

        if(pbit.invert_bits) temp_bit ^= pbit.param_mask;

        shift_delta = (pbit.pos_in_assy) - (pbit.pos_in_param);

        if(shift_delta >= 0)
            temp_bit <<= shift_delta;
        else
            temp_bit >>= abs(shift_delta);

        temp_assy |= temp_bit;
    }

    return temp_assy;
}

INT64 ASSY_NODE::get_programmed(int site) {

    CHECK_SITE_EXIT_0

    INT64 temp_bit = 0;
    INT64 temp_assy = 0;
    int   shift_delta;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        temp_bit = pbit.link->get_programmed(site);
        temp_bit &= pbit.param_mask;

        if(pbit.invert_bits) temp_bit ^= pbit.param_mask;

        shift_delta = (pbit.pos_in_assy) - (pbit.pos_in_param);

        if(shift_delta >= 0)
            temp_bit <<= shift_delta;
        else
            temp_bit >>= abs(shift_delta);

        temp_assy |= temp_bit;
    }

    return temp_assy;
}

INT64 ASSY_NODE::get_read_back(int site) {

    CHECK_SITE_EXIT_0

    INT64 temp_bit = 0;
    INT64 temp_assy = 0;
    int   shift_delta;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        temp_bit = pbit.link->get_read_back(site);
        temp_bit &= pbit.param_mask;

        if(pbit.invert_bits) temp_bit ^= pbit.param_mask;

        shift_delta = (pbit.pos_in_assy) - (pbit.pos_in_param);

        if(shift_delta >= 0)
            temp_bit <<= shift_delta;
        else
            temp_bit >>= abs(shift_delta);

        temp_assy |= temp_bit;
    }

    return temp_assy;
}

INT64 ASSY_NODE::get_saved(int site) {

    CHECK_SITE_EXIT_0

    INT64 temp_bit = 0;
    INT64 temp_assy = 0;
    int   shift_delta;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        temp_bit = pbit.link->get_saved(site);
        temp_bit &= pbit.param_mask;

        if(pbit.invert_bits) temp_bit ^= pbit.param_mask;

        shift_delta = (pbit.pos_in_assy) - (pbit.pos_in_param);

        if(shift_delta >= 0)
            temp_bit <<= shift_delta;
        else
            temp_bit >>= abs(shift_delta);

        temp_assy |= temp_bit;
    }

    return temp_assy;
}

INT64 ASSY_NODE::get_start(int site) {

    CHECK_SITE_EXIT_0

    INT64 temp_bit = 0;
    INT64 temp_assy = 0;
    int   shift_delta;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        temp_bit = pbit.link->get_start(site);
        temp_bit &= pbit.param_mask;

        if(pbit.invert_bits) temp_bit ^= pbit.param_mask;

        shift_delta = (pbit.pos_in_assy) - (pbit.pos_in_param);

        if(shift_delta >= 0)
            temp_bit <<= shift_delta;
        else
            temp_bit >>= abs(shift_delta);

        temp_assy |= temp_bit;
    }

    return temp_assy;
}

bool ASSY_NODE::parity_working_even(int site) {
    return parity_even(site, false);
}

bool ASSY_NODE::parity_working_odd(int site) {
    return !parity_working_even(site);
}

bool ASSY_NODE::parity_read_back_even(int site) {
    return parity_even(site, true);
}

bool ASSY_NODE::parity_read_back_odd(int site) {
    return !parity_read_back_even(site);
}

bool ASSY_NODE::parity_even(int site, bool read_back) {

    CHECK_SITE_EXIT_0

    bool bit;
    bool parity_bit = false;

    for(unsigned i = 0; i < count(); i++) {
        if(read_back)
            bit = ((*this)[i].get_read_back(site) ? true : false);
        else
            bit = ((*this)[i].get_working(site) ? true : false);
        parity_bit ^= bit;
    }

    return parity_bit;
}

void ASSY_NODE::set_working(INT64 value, int site) {

    CHECK_SITE_EXIT

    INT64    temp_bit = 0;
    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        temp_bit = value;
        temp_bit &= pbit.assy_mask;

        if(pbit.invert_bits) temp_bit ^= pbit.assy_mask;

        inverted_param_mask = UINT_MAX - pbit.param_mask;

        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_working((pbit.link->get_working(TSITE) & inverted_param_mask), TSITE);
                if(temp_bit)
                    pbit.link->set_working((pbit.link->get_working(TSITE) | pbit.param_mask), TSITE);
            }
        } else {
            pbit.link->set_working((pbit.link->get_working(site) & inverted_param_mask), site);
            if(temp_bit)
                pbit.link->set_working((pbit.link->get_working(site) | pbit.param_mask), site);
        }
    }
}

void ASSY_NODE::set_read_back(INT64 value, int site) {

    CHECK_SITE_EXIT

    INT64    temp_bit = 0;
    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        temp_bit = value;
        temp_bit &= pbit.assy_mask;

        if(pbit.invert_bits) temp_bit ^= pbit.assy_mask;

        inverted_param_mask = UINT_MAX - pbit.param_mask;

        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_read_back((pbit.link->get_read_back(TSITE) & inverted_param_mask), TSITE);
                if(temp_bit)
                    pbit.link->set_read_back((pbit.link->get_read_back(TSITE) | pbit.param_mask), TSITE);
            }
        } else {
            pbit.link->set_read_back((pbit.link->get_read_back(site) & inverted_param_mask), site);
            if(temp_bit)
                pbit.link->set_read_back((pbit.link->get_read_back(site) | pbit.param_mask), site);
        }
    }
}

void ASSY_NODE::set_saved(INT64 value, int site) {

    CHECK_SITE_EXIT

    INT64    temp_bit = 0;
    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        temp_bit = value;
        temp_bit &= pbit.assy_mask;

        if(pbit.invert_bits) temp_bit ^= pbit.assy_mask;

        inverted_param_mask = UINT_MAX - pbit.param_mask;

        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_saved((pbit.link->get_saved(TSITE) & inverted_param_mask), TSITE);
                if(temp_bit)
                    pbit.link->set_saved((pbit.link->get_saved(TSITE) | pbit.param_mask), TSITE);
            }
        } else {
            pbit.link->set_saved((pbit.link->get_saved(site) & inverted_param_mask), site);
            if(temp_bit)
                pbit.link->set_saved((pbit.link->get_saved(site) | pbit.param_mask), site);
        }
    }
}

void ASSY_NODE::sot(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;

        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_working((pbit.link->get_working(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_working((pbit.link->get_working(TSITE) | (pbit.link->get_start(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_working((pbit.link->get_working(site) & inverted_param_mask), site);
            pbit.link->set_working((pbit.link->get_working(site) | (pbit.link->get_start(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::programmed(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;

        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_programmed((pbit.link->get_programmed(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_programmed((pbit.link->get_programmed(TSITE) | (pbit.link->get_working(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_programmed((pbit.link->get_programmed(site) & inverted_param_mask), site);
            pbit.link->set_programmed((pbit.link->get_programmed(site) | (pbit.link->get_working(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::save_programmed() {

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        TREG_SERIAL_ALL {
            pbit.link->set_saved((pbit.link->get_saved(TSITE) & inverted_param_mask), TSITE);
            pbit.link->set_saved((pbit.link->get_saved(TSITE) | (pbit.link->get_programmed(TSITE) & pbit.param_mask)), TSITE);
        }
    }
}

void ASSY_NODE::save_working() {

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        TREG_SERIAL_ALL {
            pbit.link->set_saved((pbit.link->get_saved(TSITE) & inverted_param_mask), TSITE);
            pbit.link->set_saved((pbit.link->get_saved(TSITE) | (pbit.link->get_working(TSITE) & pbit.param_mask)), TSITE);
        }
    }
}

void ASSY_NODE::save_read_back() {

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        TREG_SERIAL_ALL {
            pbit.link->set_saved((pbit.link->get_saved(TSITE) & inverted_param_mask), TSITE);
            pbit.link->set_saved((pbit.link->get_saved(TSITE) | (pbit.link->get_read_back(TSITE) & pbit.param_mask)), TSITE);
        }
    }
}

void ASSY_NODE::restore_programmed() {

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        TREG_SERIAL_ALL {
            pbit.link->set_programmed((pbit.link->get_programmed(TSITE) & inverted_param_mask), TSITE);
            pbit.link->set_programmed((pbit.link->get_programmed(TSITE) | (pbit.link->get_saved(TSITE) & pbit.param_mask)), TSITE);
        }
    }
}

void ASSY_NODE::restore_working() {

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        TREG_SERIAL_ALL {
            pbit.link->set_working((pbit.link->get_working(TSITE) & inverted_param_mask), TSITE);
            pbit.link->set_working((pbit.link->get_working(TSITE) | (pbit.link->get_saved(TSITE) & pbit.param_mask)), TSITE);
        }
    }
}

void ASSY_NODE::restore_read_back() {

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        TREG_SERIAL_ALL {
            pbit.link->set_read_back((pbit.link->get_read_back(TSITE) & inverted_param_mask), TSITE);
            pbit.link->set_read_back((pbit.link->get_read_back(TSITE) | (pbit.link->get_saved(TSITE) & pbit.param_mask)), TSITE);
        }
    }
}

void ASSY_NODE::copy_prog_to_work(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_working((pbit.link->get_working(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_working((pbit.link->get_working(TSITE) | (pbit.link->get_programmed(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_working((pbit.link->get_working(site) & inverted_param_mask), site);
            pbit.link->set_working((pbit.link->get_working(site) | (pbit.link->get_programmed(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::copy_read_to_work(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_working((pbit.link->get_working(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_working((pbit.link->get_working(TSITE) | (pbit.link->get_read_back(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_working((pbit.link->get_working(site) & inverted_param_mask), site);
            pbit.link->set_working((pbit.link->get_working(site) | (pbit.link->get_read_back(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::copy_start_to_work(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_working((pbit.link->get_working(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_working((pbit.link->get_working(TSITE) | (pbit.link->get_start(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_working((pbit.link->get_working(site) & inverted_param_mask), site);
            pbit.link->set_working((pbit.link->get_working(site) | (pbit.link->get_start(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::copy_read_to_prog(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_programmed((pbit.link->get_programmed(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_programmed((pbit.link->get_programmed(TSITE) | (pbit.link->get_read_back(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_programmed((pbit.link->get_programmed(site) & inverted_param_mask), site);
            pbit.link->set_programmed((pbit.link->get_programmed(site) | (pbit.link->get_read_back(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::copy_work_to_prog(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_programmed((pbit.link->get_programmed(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_programmed((pbit.link->get_programmed(TSITE) | (pbit.link->get_working(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_programmed((pbit.link->get_programmed(site) & inverted_param_mask), site);
            pbit.link->set_programmed((pbit.link->get_programmed(site) | (pbit.link->get_working(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::copy_start_to_prog(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_programmed((pbit.link->get_programmed(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_programmed((pbit.link->get_programmed(TSITE) | (pbit.link->get_start(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_programmed((pbit.link->get_programmed(site) & inverted_param_mask), site);
            pbit.link->set_programmed((pbit.link->get_programmed(site) | (pbit.link->get_start(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::copy_work_to_read(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_read_back((pbit.link->get_read_back(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_read_back((pbit.link->get_read_back(TSITE) | (pbit.link->get_working(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_read_back((pbit.link->get_read_back(site) & inverted_param_mask), site);
            pbit.link->set_read_back((pbit.link->get_read_back(site) | (pbit.link->get_working(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::copy_prog_to_read(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_read_back((pbit.link->get_read_back(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_read_back((pbit.link->get_read_back(TSITE) | (pbit.link->get_programmed(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_read_back((pbit.link->get_read_back(site) & inverted_param_mask), site);
            pbit.link->set_read_back((pbit.link->get_read_back(site) | (pbit.link->get_programmed(site) & pbit.param_mask)), site);
        }
    }
}

void ASSY_NODE::copy_start_to_read(int site) {

    CHECK_SITE_EXIT

    unsigned inverted_param_mask;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &pbit = (*this)[i];
        inverted_param_mask = UINT_MAX - pbit.param_mask;
        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                pbit.link->set_read_back((pbit.link->get_read_back(TSITE) & inverted_param_mask), TSITE);
                pbit.link->set_read_back((pbit.link->get_read_back(TSITE) | (pbit.link->get_start(TSITE) & pbit.param_mask)), TSITE);
            }
        } else {
            pbit.link->set_read_back((pbit.link->get_read_back(site) & inverted_param_mask), site);
            pbit.link->set_read_back((pbit.link->get_read_back(site) | (pbit.link->get_start(site) & pbit.param_mask)), site);
        }
    }
}

bool ASSY_NODE::comp_prog(char *value, int site) {
    return comp_prog((const char *)value, site);
}

bool ASSY_NODE::comp_prog(const char *value, int site) {

    CHECK_SITE_EXIT_0

    bool param_bit;
    bool value_bit;
    char *p;
    char buff[200];
    unsigned i = 0;

    // Format Characters ----------------
    strcpy_s(buff, sizeof(buff) / sizeof(char), value);                                    // nessesary as set_bit could be const
    for(p = buff; p < buff + strlen(value); p++)
        if(isupper(*p))  *p = tolower(*p);                  // changes characters to lower case
    p = buff;

    for(unsigned j = 0; j < count(); j++) {
        i = count() - j - 1;                                // start from end of bit list (MSB)
        ASSY_BIT &bit = (*this)[i];
        while(*p != '\0' && *p != '1' && *p != '0' && *p != 'x' && p < buff + strlen(value)) p++; // step forward till '1', '0' or 'x' is found

        if(site == MS_ALL) {
            TREG_SERIAL {
                if(bit.invert_bits)
                    param_bit = (bit.link->get_programmed(TSITE) & bit.param_mask) ? false : true;    // check if programmed bit is set and invert it
                else
                    param_bit = (bit.link->get_programmed(TSITE) & bit.param_mask) ? true : false;    // check if programmed bit is set

                switch(*p) {
                    case '1':   value_bit = true;
                        break;
                    case '0':   value_bit = false;
                        break;
                    case 'x':   value_bit = param_bit;        // if 'x' do not check param bit
                        break;
                    default :   TREG_ERROR::error("Wrong character detected in '%s' passed to function 'comp_prog()'", buff);
                }

                if(param_bit != value_bit)
                    return false;                // stop comparison as soon as one error is found
            };
        } else {
            if(bit.invert_bits)
                param_bit = (bit.link->get_programmed(site) & bit.param_mask) ? false : true;
            else
                param_bit = (bit.link->get_programmed(site) & bit.param_mask) ? true : false;


            switch(*p) {
                case '1':   value_bit = true;
                    break;
                case '0':   value_bit = false;
                    break;
                case 'x':   value_bit = param_bit;        // if 'x' do not check param bit
                    break;
                default :   TREG_ERROR::error("Wrong character detected in '%s' passed to function 'comp_prog()'", buff);
            }

            if(param_bit != value_bit)
                return false;                // stop comparison as soon as one error is found
        }
        p++;
        if(p == '\0') break;                    // if all characters has been checked break even if there are still bits in register
    }

    return true;    // if all bits are the same as "value" return true
}

bool ASSY_NODE::comp_prog(INT64 value, int site) {

    CHECK_SITE_EXIT_0

    bool  param_bit;
    bool  value_bit;
    INT64 mask = 1;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &bit = (*this)[i];
        if(site == MS_ALL) {
            value_bit = (value & mask) ? true : false;
            TREG_SERIAL {
                if(bit.invert_bits)
                    param_bit = (bit.link->get_programmed(TSITE) & bit.param_mask) ? false : true;    // check if programmed bit is set and invert it
                else
                    param_bit = (bit.link->get_programmed(TSITE) & bit.param_mask) ? true : false;    // check if programmed bit is set

                if(param_bit != value_bit)
                    return false;                // stop comparison as soon as one error is found
            };
        } else {
            value_bit = (value & mask) ? true : false;

            if(bit.invert_bits)
                param_bit = (bit.link->get_programmed(site) & bit.param_mask) ? false : true;
            else
                param_bit = (bit.link->get_programmed(site) & bit.param_mask) ? true : false;

            if(param_bit != value_bit)
                return false;                // stop comparison as soon as one error is found
        }
        mask <<= 1;
    }

    return true;    // if all bits are the same as "value" return true
}

bool ASSY_NODE::comp_prog_to_read(int site) {

    CHECK_SITE_EXIT_0

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &bit = (*this)[i];
        if(site == MS_ALL) {
            TREG_SERIAL {
                if((bit.link->get_programmed(TSITE) & bit.param_mask) != (bit.link->get_read_back(TSITE) & bit.param_mask))
                    return false;
            }
        } else {
            if((bit.link->get_programmed(site) & bit.param_mask) != (bit.link->get_read_back(site) & bit.param_mask))
                return false;
        }
    }

    return true;
}

bool ASSY_NODE::comp_read(char *value, int site) {
    return comp_read((const char *)value, site);
}

bool ASSY_NODE::comp_read(const char *value, int site) {

    CHECK_SITE_EXIT_0

    bool param_bit;
    bool value_bit;
    char *p;
    char buff[200];
    unsigned i = 0;

    // Format Characters ----------------
    strcpy_s(buff, sizeof(buff) / sizeof(char), value);                                    // nessesary as set_bit could be const
    for(p = buff; p < buff + strlen(value); p++)
        if(isupper(*p))  *p = tolower(*p);                  // changes characters to lower case
    p = buff;

    for(unsigned j = 0; j < count(); j++) {
        i = count() - j - 1;                                // start from end of bit list (MSB)
        ASSY_BIT &bit = (*this)[i];
        while(*p != '\0' && *p != '1' && *p != '0' && *p != 'x' && p < buff + strlen(value)) p++; // step forward till '1', '0' or 'x' is found

        if(site == MS_ALL) {
            TREG_SERIAL {
                if(bit.invert_bits)
                    param_bit = (bit.link->get_read_back(TSITE) & bit.param_mask) ? false : true;    // check if programmed bit is set and invert it
                else
                    param_bit = (bit.link->get_read_back(TSITE) & bit.param_mask) ? true : false;    // check if programmed bit is set

                switch(*p) {
                    case '1':   value_bit = true;       break;
                    case '0':   value_bit = false;      break;
                    case 'x':   value_bit = param_bit;  break;         // if 'x' do not check param bit
                    default :   TREG_ERROR::error("Wrong character detected in '%s' passed to function 'comp_read()'", buff);
                }

                if(param_bit != value_bit)
                    return false;                // stop comparison as soon as one error is found
            };
        } else {
            if(bit.invert_bits)
                param_bit = (bit.link->get_read_back(site) & bit.param_mask) ? false : true;
            else
                param_bit = (bit.link->get_read_back(site) & bit.param_mask) ? true : false;

            switch(*p) {
                case '1':   value_bit = true;         break;
                case '0':   value_bit = false;        break;
                case 'x':   value_bit = param_bit;    break;        // if 'x' do not check param bit
                default :   TREG_ERROR::error("Wrong character detected in '%s' passed to function 'comp_read()'", buff);
            }

            if(param_bit != value_bit)
                return false;                // stop comparison as soon as one error is found
        }

        p++;
        if(p == '\0') break;        // if all characters has been checked break even if there are still bits in register
    }

    return true;    // if all bits are the same as "value" return true
}

bool ASSY_NODE::comp_read(INT64 value, int site) {

    CHECK_SITE_EXIT_0

    bool  param_bit;
    bool  value_bit;
    INT64 mask = 1;

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &bit = (*this)[i];
        if(site == MS_ALL) {
            value_bit = (value & mask) ? true : false;
            TREG_SERIAL {
                if(bit.invert_bits)
                    param_bit = (bit.link->get_read_back(TSITE) & bit.param_mask) ? false : true;    // check if programmed bit is set and invert it
                else
                    param_bit = (bit.link->get_read_back(TSITE) & bit.param_mask) ? true : false;    // check if programmed bit is set

                if(param_bit != value_bit)
                    return false;                // stop comparison as soon as one error is found
            };
        } else {
            value_bit = (value & mask) ? true : false;

            if(bit.invert_bits)
                param_bit = (bit.link->get_read_back(site) & bit.param_mask) ? false : true;
            else
                param_bit = (bit.link->get_read_back(site) & bit.param_mask) ? true : false;

            if(param_bit != value_bit)
                return false;                // stop comparison as soon as one error is found
        }
        mask <<= 1;
    }

    return true;    // if all bits are the same as "value" return true
}

bool ASSY_NODE::comp_read_to_start(int site) {

    CHECK_SITE_EXIT_0

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &bit = (*this)[i];
        if(site == MS_ALL) {
            TREG_SERIAL {
                if((bit.link->get_read_back(TSITE) & bit.param_mask) != (bit.link->get_start(TSITE) & bit.param_mask))
                    return false;
            }
        } else {
            if((bit.link->get_read_back(site) & bit.param_mask) != (bit.link->get_start(site) & bit.param_mask))
                return false;
        }
    }

    return true;
}

bool ASSY_NODE::comp_read_to_work(int site) {

    CHECK_SITE_EXIT_0

    for(unsigned i = 0; i < count(); i++) {
        ASSY_BIT &bit = (*this)[i];
        if(site == MS_ALL) {
            TREG_SERIAL {
                if((bit.link->get_read_back(TSITE) & bit.param_mask) != (bit.link->get_working(TSITE) & bit.param_mask))
                    return false;
            }
        } else {
            if((bit.link->get_read_back(site) & bit.param_mask) != (bit.link->get_working(site) & bit.param_mask))
                return false;
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////
// ASSY
ASSY::ASSY() {
    treg_site = 0;
}

ASSY::~ASSY() {

}

void ASSY::print(int site) {

    CHECK_SITE_EXIT

    string  assy_name;
    string  bit_name;
    int     i;
    FILE    *file_pointer;
    STORAGE *p;

    fopen_s(&file_pointer, "register.txt", "w");

    if(file_pointer && count()) {
        fprintf(file_pointer, "Actual Assembly state: \n\n");
        for(unsigned a = 0; a < count(); a++) {
            ASSY_NODE &assy = (*this)[a];
            assy_name = assy.name;
            fprintf(file_pointer, "Assy Name           Assy_size   Pos in Assy  Parameter Name       Param Bit   Site    Work    Prog    Read    Start    Saved\n");
            for(unsigned b = 0; b < assy.count(); b++) {
                ASSY_BIT &bit = assy[b];
                p = bit.link;
                bit_name = bit.name;
                fprintf(file_pointer, "%s", assy_name.c_str());
                for(i = strlen(assy_name.c_str()); i < 25; i++) fprintf(file_pointer, " ");
                fprintf(file_pointer, "%d          %d       %s",                     assy.count(),
                        bit.pos_in_assy,
                        bit_name.c_str());
                for(i = strlen(bit_name.c_str()); i < 23; i++) fprintf(file_pointer, " ");
                fprintf(file_pointer, "%s %d         %d       ",                     bit.invert_bits ? "!" : " ",
                        bit.pos_in_param,
                        site);
                fprintf(file_pointer, "%d       %d       %d       %d        %d\n", (p->get_working(site)    & bit.param_mask) ? 1 : 0,
                        (p->get_programmed(site) & bit.param_mask) ? 1 : 0,
                        (p->get_read_back(site)  & bit.param_mask) ? 1 : 0,
                        (p->get_start(site)      & bit.param_mask) ? 1 : 0,
                        (p->get_saved(site)      & bit.param_mask) ? 1 : 0);
            }
            for(i = 0; i < 77; i++) fprintf(file_pointer, " ");
            fprintf(file_pointer, "------  ------  ------  ------  ------   ------\n");
            for(i = 0; i < 79; i++) fprintf(file_pointer, " ");
            fprintf(file_pointer, "%d     0x%04lx  ", site, assy.get_working(site));
            fprintf(file_pointer, "0x%04lx  ",             assy.get_programmed(site));
            fprintf(file_pointer, "0x%04lx  ",             assy.get_read_back(site));
            fprintf(file_pointer, "0x%04lx   ",            assy.get_start(site));
            fprintf(file_pointer, "0x%04lx \n\n",          assy.get_saved(site));
        }
        fclose(file_pointer);
    }
}

void ASSY::print(char *assembly_name, int site, bool overwrite_file) {
    print((const char *)assembly_name, site, overwrite_file);
}

void ASSY::print(const char *assembly_name, int site, bool overwrite_file) {

    CHECK_SITE_EXIT

    string bit_name;
    string assy_name = assembly_name;
    int    i;

    FILE *file_pointer;

    ASSY_NODE *assy_pointer = find(assembly_name);
    STORAGE   *p;

    if(overwrite_file)
        fopen_s(&file_pointer, "register_status.txt", "w");
    else
        fopen_s(&file_pointer, "register_status.txt", "a");

    if(file_pointer && assy_pointer) {
        fprintf(file_pointer, "Actual EEPROM register state: \n\n");

        if(site == MS_ALL) {
            TREG_SERIAL_ALL {
                fprintf(file_pointer, "Register Name        Reg_size   Pos in Reg  Parameter Name       Param Bit   Site    Work    Prog    Read    Start    Saved\n");
                for(unsigned b = 0; b < assy_pointer->count(); b++) {
                    ASSY_BIT &bit = (*assy_pointer)[b];
                    p = bit.link;
                    bit_name = bit.name;
                    fprintf(file_pointer, "%s", assy_name.c_str());
                    for(i = strlen(assy_name.c_str()); i < 25; i++) fprintf(file_pointer, " ");
                    fprintf(file_pointer, "%d          %d       %s",                     assy_pointer->count(),
                    bit.pos_in_assy,
                    bit_name.c_str());
                    for(i = strlen(bit_name.c_str()); i < 23; i++) fprintf(file_pointer, " ");
                    fprintf(file_pointer, "%s %d         %d       ",                     bit.invert_bits ? "!" : " ",
                    bit.pos_in_param,
                    TSITE);

                    fprintf(file_pointer, "%d       %d       %d       %d        %d\n", (p->get_working(TSITE)    & bit.param_mask) ? 1 : 0,
                    (p->get_programmed(TSITE) & bit.param_mask) ? 1 : 0,
                    (p->get_read_back(TSITE)  & bit.param_mask) ? 1 : 0,
                    (p->get_start(TSITE)      & bit.param_mask) ? 1 : 0,
                    (p->get_saved(TSITE)      & bit.param_mask) ? 1 : 0);
                }
                for(i = 0; i < 77; i++) fprintf(file_pointer, " ");
                fprintf(file_pointer, "------  ------  ------  ------  ------   ------\n");
                for(i = 0; i < 79; i++) fprintf(file_pointer, " ");
                fprintf(file_pointer, "%d     0x%04lx  ", TSITE, assy_pointer->get_working(TSITE));
                fprintf(file_pointer, "0x%04lx  ",              assy_pointer->get_programmed(TSITE));
                fprintf(file_pointer, "0x%04lx  ",              assy_pointer->get_read_back(TSITE));
                fprintf(file_pointer, "0x%04lx   ",             assy_pointer->get_start(TSITE));
                fprintf(file_pointer, "0x%04lx \n\n",           assy_pointer->get_saved(TSITE));
            }
        } else {
            fprintf(file_pointer, "Register Name        Reg_size   Pos in Reg  Parameter Name       Param Bit   Site    Work    Prog    Read    Start    Saved\n");
            for(unsigned b = 0; b < assy_pointer->count(); b++) {
                ASSY_BIT &bit = (*assy_pointer)[b];
                p = bit.link;
                bit_name = bit.name;
                fprintf(file_pointer, "%s", assy_name.c_str());
                for(i = strlen(assy_name.c_str()); i < 25; i++) fprintf(file_pointer, " ");
                fprintf(file_pointer, "%d          %d       %s",                     assy_pointer->count(),
                        bit.pos_in_assy,
                        bit_name.c_str());
                for(i = strlen(bit_name.c_str()); i < 23; i++) fprintf(file_pointer, " ");
                fprintf(file_pointer, "%s %d         %d       ",                     bit.invert_bits ? "!" : " ",
                        bit.pos_in_param,
                        site);
                fprintf(file_pointer, "%d       %d       %d       %d        %d\n", (p->get_working(site)    & bit.param_mask) ? 1 : 0,
                        (p->get_programmed(site) & bit.param_mask) ? 1 : 0,
                        (p->get_read_back(site)  & bit.param_mask) ? 1 : 0,
                        (p->get_start(site)      & bit.param_mask) ? 1 : 0,
                        (p->get_saved(site)      & bit.param_mask) ? 1 : 0);
            }
            for(i = 0; i < 77; i++) fprintf(file_pointer, " ");
            fprintf(file_pointer, "------  ------  ------  ------  ------   ------\n");
            for(i = 0; i < 79; i++) fprintf(file_pointer, " ");
            fprintf(file_pointer, "%d     0x%04lx  ", site, assy_pointer->get_working(site));
            fprintf(file_pointer, "0x%04lx  ",             assy_pointer->get_programmed(site));
            fprintf(file_pointer, "0x%04lx  ",             assy_pointer->get_read_back(site));
            fprintf(file_pointer, "0x%04lx   ",            assy_pointer->get_start(site));
            fprintf(file_pointer, "0x%04lx \n\n",          assy_pointer->get_saved(site));
        }
        fclose(file_pointer);
    }
}

///////////////////////////////////////////////////////////////////////////////
// ASSY_LINK class
ASSY_LINK::ASSY_LINK() {
    link = new ASSY_NODE;
    link_default = true;
    assy_address = 0;
}

ASSY_LINK::~ASSY_LINK() {
    if(link_default) {
        delete link;
        link = 0;
    }
}

void ASSY_LINK::init(string address_info) {
    char const  *p;
    char        sep[] = "\"";
    char        *address;
    double      result = 0;
    string      err;
	char *next_token=NULL;

    if(!address_info.empty()) {
        PARSER  *parser = new PARSER;

        address = new char[strlen(address_info.c_str()) + 1];
        strcpy_s(address, strlen(address_info.c_str()) + 1, address_info.c_str());

		p = strtok_s(address, sep, &next_token);
        err = parser->parse(p, &result);
        if(err.empty())
            assy_address = (unsigned)result;
        else
            TREG_ERROR::error("TREG: %s in address '%s' for assy '%s'", err.c_str(), address, this->get_name());

        p = strtok_s(NULL, sep, &next_token);
        if(p)
            vector_label = p;

        delete [] address; address = NULL;
        delete parser; parser = NULL;
    }
}

///////////////////////////////////////////////////////////////////////////////
// ASSY_GRP_NODE class
ASSY_GRP_NODE::ASSY_GRP_NODE() {

}

ASSY_GRP_NODE::~ASSY_GRP_NODE() {

}

ASSY_LINK &ASSY_GRP_NODE::operator()(unsigned index) {
    return TREG_LIST<ASSY_LINK>::operator [](index);
}

ASSY_NODE &ASSY_GRP_NODE::operator[](unsigned index) {
    return (*ASSY_GRP_NODE::operator()(index).link);
}

///////////////////////////////////////////////////////////////////////////////
// ASSY_GRP class
ASSY_GRP::ASSY_GRP() {

}

ASSY_GRP::~ASSY_GRP() {

}

void ASSY_GRP_NODE::set_working(INT64 value, int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)[i].set_working(value, site);
}

void ASSY_GRP_NODE::set_read_back(INT64 value, int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)[i].set_read_back(value, site);
}

void ASSY_GRP_NODE::set_saved(INT64 value, int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)[i].set_saved(value, site);
}

void ASSY_GRP_NODE::programmed(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->programmed(site);
}

bool ASSY_GRP_NODE::comp_prog(char *value, int site) {
    return comp_prog((const char *)value, site);
}

bool ASSY_GRP_NODE::comp_prog(const char *value, int site) {

    CHECK_SITE_EXIT_0

    bool is_equal = true;

    if(!count())
        return false;

    for(unsigned i = 0; i < count(); i++)
        is_equal &= (*this)(i).link->comp_prog(value, site);

    return is_equal;
}

bool ASSY_GRP_NODE::comp_prog_to_read(int site) {

    CHECK_SITE_EXIT_0

    bool is_equal = true;

    if(!count())
        return false;

    for(unsigned i = 0; i < count(); i++)
        is_equal &= (*this)(i).link->comp_prog_to_read(site);

    return is_equal;
}

bool ASSY_GRP_NODE::comp_read(char *value, int site) {
    return comp_read((const char *)value, site);
}

bool ASSY_GRP_NODE::comp_read(const char *value, int site) {

    CHECK_SITE_EXIT_0

    bool is_equal = true;

    if(!count())
        return false;

    for(unsigned i = 0; i < count(); i++)
        is_equal &= (*this)(i).link->comp_read(value, site);

    return is_equal;
}

bool ASSY_GRP_NODE::comp_read_to_work(int site) {

    CHECK_SITE_EXIT_0

    bool is_equal = true;

    if(!count())
        return false;

    for(unsigned i = 0; i < count(); i++)
        is_equal &= (*this)(i).link->comp_read_to_work(site);

    return is_equal;
}

bool ASSY_GRP_NODE::comp_read_to_start(int site) {

    CHECK_SITE_EXIT_0

    bool is_equal = true;

    if(!count())
        return false;

    for(unsigned i = 0; i < count(); i++)
        is_equal &= (*this)(i).link->comp_read_to_start(site);

    return is_equal;
}

bool ASSY_GRP_NODE::parity_working_even(int site) {

    CHECK_SITE_EXIT_0

    bool bit_value;
    bool check_sum = false;

    // loop through all assys within the group
    for(unsigned a = 0; a < count(); a++) {
        ASSY_LINK &assy = (*this)(a);
        // loop through all bits within the group
        for(unsigned b = 0; b < assy.link->count(); b++) {
            ASSY_BIT &bit = (*assy.link)[b];
            bit_value = ((bit.link->get_working(site) & bit.param_mask) ? true : false) ^ bit.invert_bits;
            check_sum = check_sum ^ bit_value;
        }
    }
    return check_sum;
}

bool ASSY_GRP_NODE::parity_working_odd(int site) {
    CHECK_SITE_EXIT_0
    return !parity_working_even(site);
}

bool ASSY_GRP_NODE::parity_read_back_even(int site) {
    CHECK_SITE_EXIT_0

    bool bit_value;
    bool check_sum = false;

    // loop through all assys within the group
    for(unsigned a = 0; a < count(); a++) {
        ASSY_LINK &assy = (*this)(a);
        // loop through all bits within the group
        for(unsigned b = 0; b < assy.link->count(); b++) {
            ASSY_BIT &bit = (*assy.link)[b];
            bit_value = ((bit.link->get_read_back(site) & bit.param_mask) ? true : false) ^ bit.invert_bits;
            check_sum = check_sum ^ bit_value;
        }
    }
    return check_sum;
}

bool ASSY_GRP_NODE::parity_read_back_odd(int site) {
    CHECK_SITE_EXIT_0
    return !parity_read_back_even(site);
}

void ASSY_GRP_NODE::save_working() {
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->save_working();
}

void ASSY_GRP_NODE::save_read_back() {
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->save_read_back();
}

void ASSY_GRP_NODE::restore_working() {
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->restore_working();
}

void ASSY_GRP_NODE::restore_read_back() {
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->restore_read_back();
}

void ASSY_GRP_NODE::copy_prog_to_work(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_prog_to_work(site);
}

void ASSY_GRP_NODE::copy_read_to_work(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_read_to_work(site);
}

void ASSY_GRP_NODE::copy_start_to_work(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_start_to_work(site);
}

void ASSY_GRP_NODE::copy_work_to_prog(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_work_to_prog(site);
}

void ASSY_GRP_NODE::copy_read_to_prog(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_read_to_prog(site);
}

void ASSY_GRP_NODE::copy_start_to_prog(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_start_to_prog(site);
}

void ASSY_GRP_NODE::copy_work_to_read(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_work_to_read(site);
}

void ASSY_GRP_NODE::copy_prog_to_read(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_prog_to_read(site);
}

void ASSY_GRP_NODE::copy_start_to_read(int site) {
    CHECK_SITE_EXIT
    for(unsigned i = 0; i < count(); i++)
        (*this)(i).link->copy_start_to_read(site);
}

///////////////////////////////////////////////////////////////////////////////
// TREG class
int TREG::using_simulator = 0;
int TREG::engineering_mode = 0;
int TREG::sites = 0;

TREG::TREG() {
#ifdef TREG_ETS364
    const char *my_dll_name=GetTestMainVariable(EXE_FILE);
    HMODULE me=GetModuleHandle(my_dll_name);
    if(me) {
        get_limits_func=(get_limits_t)GetProcAddress(me,"?static_get_limits@DataCollection@@SAHHPAN0PADH1H0@Z");
        log_data_func=(log_data_t)GetProcAddress(me,"?static_logData@DataCollection@@SAXHPADNNN0H@Z");
        test_func=(test_t)GetProcAddress(me,"?static_test@DataCollection@@SAXHNHH@Z");
    }
#endif
}

TREG::~TREG() {

}

// This function returns the value for 'setting' in the *.treg file. If 'setting' is not found
// in 'param' it looks in _DEFAULT section if available. The return values are as following:
//      setting found nowhere -> returns 0 (=disabled)
//      setting is a number   -> returns number
//      setting is a boolean  -> if false returns 0; if true returns 'default_value'
static int getSettings(READER &r, const char *param, const char *setting, int default_value) {
    bool flag = false;
    int return_value = 0; // return 0 if it's not found anywhere
    
    if(r.getBoolean(param, setting, &flag)) // check for true/false on parameter
        flag ? return_value = default_value : return_value = 0;
    else if(!r.getInteger(param, setting, &return_value)) {     // check for integer on parameter
        if((r.getSection(_DEFAULT))) {                          // check for _DEFAULT section
            if(r.getBoolean(_DEFAULT, setting, &flag))          // check for true/false on DEFAULT
                flag ? return_value = default_value : return_value = 0;
            else
                r.getInteger(_DEFAULT, setting, &return_value); // check for integer on DEFAULT
        }
    }
    return return_value;
}

static bool getBooleanSettings(READER &r, const char *param, const char *setting) {
    bool flag = false;
    
    if(r.getBoolean(param, setting, &flag)) // check for true/false on parameter
        return flag;
    else {
        if((r.getSection(_DEFAULT))) {                          // check for _DEFAULT section
            if(r.getBoolean(_DEFAULT, setting, &flag))          // check for true/false on DEFAULT
                return flag;
        }
    }
    return false;
}

bool TREG::init(char *file_name, unsigned number_of_sites, bool QC_flag, bool Do_trim) {
    return init((const char *)file_name, number_of_sites, QC_flag, Do_trim);
}

bool TREG::init(const char *file_name, unsigned number_of_sites, bool QC_flag, bool Do_trim) {

    sites = number_of_sites;

    TREG_SERIAL_ALL dll_active_sites[TSITE] = true; // used in SERIAL macros for none Eagle Pgms

#ifdef TREG_ETS364
    UTILSTAT_STR testerInfo;
    using_simulator = (utilstat(&testerInfo, sizeof(UTILSTAT_STR)) == 0);
    engineering_mode = (GetTestMainVariable(SECURITY_LVL) > 0);
#endif

    READER     reader;
    PARSER     parser;
    string     err;
    const char *p;

    // destroy tables if table already contains information
    if(sel.count() || trim.count() || trim_grp.count() || assy.count() || assy_grp.count()) {
        sel.~SEL();
        assy.~ASSY();
        trim.~TRIM();
        trim_grp.~TRIM_GRP();
        assy_grp.~ASSY_GRP();
    }

    trim.init();

    KEY      *key = NULL;
    SECTION  *section = NULL;

    if(!reader.open(file_name)) {
        TREG_ERROR::error("TREG::init() file '%s' not found.\n", file_name);
        return false;  // exit and return false
    }

    // check for files to be included in "DEFAULT" section
    if((section = reader.getSection(_DEFAULT))) {
        while((key = section->getNextKey())) {
            string name = key->getName();
            size_t pos = name.find("include"); // 'include' found at the beginning?
            if(pos != string::npos && pos == 0) {
                if(!reader.append(key->getString())) { // read file
                    size_t pos = name.find("include_try"); // 'include_try' found at the beginning?
                    if(!(pos != string::npos && pos == 0)) {
                        TREG_ERROR::error("TREG::init() include file '%s' not found.\n", key->getString());
                        return false;  // exit and return false
                    }
                }
            }
        }
    }

    //reader.dump("treg.txt");

    // 1. look for TRIM parameters
    // loop through all sections
    while((section = reader.getNextSection())) {
        p = section->getName();
        switch(*p) {
            case '*': // ignore other section headers (SEL,ASSY,ASSY_GRP,TRIM_GRP)
            case '_':
            case '#':
            case '$':
            case '%':
            case '&':
                break;
            default: { // TRIM found
                TRIM_NODE *node;
                if(_stricmp(p,_DEFAULT) == 0) // ignore [DEFAULT] section
                    break;
                node = trim.find(p);
                if(node) {
                    bool flag = false;
                    if(reader.getBoolean(_DEFAULT, "allow_overwrite", &flag))  
                        trim.remove(p);
                    else {
                        TREG_ERROR::error("TREG: TRIM [%s] already exists in file %s.\n", p, file_name);
                        return false;
                    }
                }
                char baseunit[20];
                int num_char_units = 0;
                int learn_trim_start = 0;
                int learn_trim_steps = 0;
                double trim_target = 0.0;
                int test_number = -1;
                bool debug = false;
             
                learn_trim_start = getSettings(reader, p,"trim_start_learn", TRIM_START_LEARN_DEFAULT);
                learn_trim_steps = getSettings(reader, p,"trim_step_learn",  TRIM_STEP_LEARN_DEFAULT);
                num_char_units   = getSettings(reader, p,"trim_step_char",   TRIM_STEP_CHAR_DEFAULT);
                reader.getBoolean(p, "debug", &debug);

                string strim_type   = reader.getString(p, "trim_type");
                string strim_table  = reader.getString(p, "table");
                string strim_target = reader.getString(p, "target");
                string strim_method = reader.getString(p, "trim_method");

                int step_count = 0; int default_step = 0;
                if(strim_table.empty()) {
                    // there is no 'table' -> require 'step_count' to be set
                    if(!reader.getInteger(p, "step_count", &step_count)) {
                        TREG_ERROR::error("TREG: TRIM [%s] Need 'step_count' if 'table' is not specified in file %s.\n", p, file_name);
                        return false;
                    }
                    // if there is no table we need to force table char and step learning
                    if(!num_char_units)
                        num_char_units = TRIM_STEP_CHAR_DEFAULT;
                    // if there is no default_step we need to force start learning
                    if(!reader.getInteger(p, "default_step", &default_step))
                        learn_trim_start = TRIM_START_LEARN_DEFAULT;
                    if(!(0 <= default_step && default_step < step_count)) { // check if default step is with in 0 <= default_step < step_count
                        TREG_ERROR::error("TREG: TRIM [%s] 'default_step' out of range file %s.\n", p, file_name);
                        return false;
                    }
                }

                if(!strim_target.empty()) {
                    if(strim_target[0] == '#') {
                        strim_target.erase(0, 1);
                        sscanf_s(strim_target.c_str(), "%d", &test_number);
#ifdef TREG_ETS364
                        double lsl = 0, usl = 0;
                        if(!get_limits(test_number, &lsl, &usl)) {
                            TREG_ERROR::error("TREG: Test number '%s' specified in file %s for TRIM [%s] does not exists.\n",
                                              strim_target.c_str(), file_name, p);
                            return false;
                        }
                        trim_target = (lsl + usl) / 2.0;
#else
                        TREG_ERROR::error("TREG: Test numbers are only supported on Eagle tester platform.\n");
                        return false;
#endif
                    } else {
                        err = parser.parse(strim_target.c_str(), &trim_target);
                        if(!err.empty()) {
                            TREG_ERROR::error("TREG: %s while parsing target '%s' for [%s] in file %s.\n",
                                              err.c_str(), strim_target.c_str(), p, file_name);
                            return false;
                        }
                        parser.getBaseUnit(baseunit);
                    }
                } else {
                    strncpy_s(baseunit, "", sizeof(baseunit));
                }

                node = trim.add_new(p);
                LCASE_STRING(strim_type);
                // historically 'trim_type' could be set to 'rel', 'abs', 'min', 'max' and 'nom'.
                // 'rel' and 'abs' are no longer used. This info is extracted now from the trim
                // table by parsing if there is a '%' sign in the string. For compatibility we
                // treat everything but 'min' and 'max' as trim_type 'nom'.
                if(strim_type != "min" && strim_type != "max")
                    strim_type = "nom"; // default to nominal trimming
                node->trim_type = strim_type.c_str();
                node->sot_target = trim_target;
                node->base_unit_target = baseunit;
                node->debug = debug;
                node->steps = step_count;
                node->nom_step = node->learned_start_step = default_step;
                node->trim_rel_mode = strim_method == "abs" ? false : true;
                if(!strim_table.empty())
                    node->init(strim_table);
                node->set_learn_trim_start(learn_trim_start);
                node->set_learn_trim_step(learn_trim_steps);
                node->set_learn_trim_char(num_char_units);
                node->name = p;
                node->tnum_target = test_number;
				node->QC = QC_flag;
				node->DO_TRIM = Do_trim;
            } break;
        }
    }

    // 2. look for SEL parameters
    // loop through all sections
    while((section = reader.getNextSection())) {
        p = section->getName();
        if(*p == '*') { // SEL found
            while((key = section->getNextKey())) {
                int value; SEL_NODE *node; TRIM_NODE *t_node;
                key->getInteger(&value);
                // check if there is a parameter with same name defined as TRIM (= require SEL/TRIMs to have unique names)
                t_node = trim.find(key->getName());
                if(t_node) {
                    TREG_ERROR::error("TREG: SEL '%s' in section [%s] already exists as TRIM in file %s.\n", key->getName(), p, file_name);
                    return false;
                }
                node = sel.find(key->getName());
                if(node) {
                    bool flag = false;
                    if(reader.getBoolean(_DEFAULT, "allow_overwrite", &flag))  
                        sel.remove(key->getName());
                    else {
                        TREG_ERROR::error("TREG: SEL '%s' in section [%s] already exists in file %s.\n", key->getName(), p, file_name);
                        return false;
                    }
                }
                node = sel.add_new(key->getName());
                TREG_SERIAL_ALL node->start[TSITE] = value;
            }
        } 
    }

    // 3. look for ASSYs (they required SEL and TRIM object to exist already)
    // loop through all sections
    while((section = reader.getNextSection())) {
        p = section->getName();
        if(*p == '_') { // ASSY found
            ASSY_NODE *node;
            node = assy.find(p + 1);
            if(node) {
                bool flag = false;
                if(reader.getBoolean(_DEFAULT, "allow_overwrite", &flag))  
                    assy.remove(p + 1);
                else {
                    TREG_ERROR::error("TREG: ASSY [%s] already exists in file %s.\n", p, file_name);
                    return false;
                }
            }
            node = assy.add_new(p + 1);
            while((key = section->getNextKey())) {
                const char *p_assy = key->getName();
                string param_bit_info = reader.getString(p, p_assy);
                if(strrchr(key->getName(), ':')) {
                    while(*p_assy != ':' && *p_assy != '\0') p_assy++;     // step forward to ':'
                    while(!isalnum(*p_assy) && *p_assy != '\0') p_assy++;  // step forward to next alphanumeric character

                    STORAGE *storage = NULL;

                    if(sel.find(p_assy))
                        storage = &sel(p_assy);
                    else if(trim.find(p_assy))
                        storage = &trim(p_assy);
                    else {
                        TREG_ERROR::error("TREG: Adding '%s' at position '%d' to ASSY [%s] failed. Please define '%s' as TRIM or SEL in file %s.\n",
                                          p_assy, node->count(), p, p_assy, file_name);
                        return false;
                    }

                    if(storage) {
                        ASSY_BIT *bit;
                        bit = node->add_new(p_assy);

                        delete bit->link;
                        bit->link_default = false;
                        bit->link = storage;

                        bit->init(node->count() - 1, param_bit_info.c_str());
                    }
                }
            }
        }
    }

    // 4. look for ASSY_GRPs and TRIM_GRPs (they required SEL, TRIM and ASSY object to exist already)
    // loop through all sections
    while((section = reader.getNextSection())) {
        p = section->getName();
        switch(*p) {
            case '#': { // ASSY_GRP found
                ASSY_GRP_NODE *node;
                node = assy_grp.find(p + 1);
                if(node) {
                    bool flag = false;
                    if(reader.getBoolean(_DEFAULT, "allow_overwrite", &flag))  
                        assy_grp.remove(p + 1);
                    else {
                        TREG_ERROR::error("TREG: ASSY_GRP [%s] already exists in file %s.\n", p, file_name);
                        return false;
                    }
                } 
                node = assy_grp.add_new(p + 1);
                while((key = section->getNextKey())) {
                    const char *p_assy = key->getName();
                    string address_info = key->getString();
                    if(strrchr(key->getName(), ':')) {
                        while(*p_assy != ':' && *p_assy != '\0') p_assy++;    // step forward to ':'
                        while(!isalnum(*p_assy) && *p_assy != '\0') p_assy++; // step forward to next alphanumeric character

                        if(assy.find(p_assy)) {
                            ASSY_LINK *link;
                            link = node->add_new(p_assy);

                            delete link->link;
                            link->link_default = false;
                            link->link = &assy(p_assy);

                            link->init(address_info);
                        } else {
                            TREG_ERROR::error("TREG: Adding '%s' to ASSY_GRP [%s] failed. Please define '%s' as ASSY in file %s.\n",
                                              p_assy, p, p_assy, file_name);
                            return false;
                        }
                    }
                }
            }
            break;
            // TRIM_GRP found
            case '&':   // '&' measurement group
            case '%':   // '%' dependend group
            case '$': { // '$' independend group
                bool is_linked_group = false, is_measure_group = false;
                TRIM_GRP_NODE *node;
                node = trim_grp.find(p + 1);
                if(node) {
                    bool flag = false;
                    if(reader.getBoolean(_DEFAULT, "allow_overwrite", &flag))  
                        trim_grp.remove(p + 1);
                    else {
                        TREG_ERROR::error("TREG: TRIM_GRP [%s] already exists in file %s.\n", p, file_name);
                        return false;
                    }
                } 
                if(*p == '%') is_linked_group = true;
                if(*p == '&') is_measure_group = true;
                node = trim_grp.add_new(p + 1);
                node->is_linked_group = is_linked_group;
                node->is_measure_group = is_measure_group;

                while((key = section->getNextKey())) {
                    string      limit_info;
                    double      lsl = FLT_MIN;
                    double      usl = FLT_MAX;
                    int         tnum_prod = -1;
                    int         tnum_char = -1;
                    const char  *p_trim = key->getName();

                    limit_info = key->getString();

                    if(!limit_info.empty()) {
                        if(limit_info[0] == '#') { // look for test numbers
#ifndef TREG_ETS364
                            TREG_ERROR::error("TREG: Test numbers are only supported on Eagle tester platform.\n");
                            return false;
#else
                            char *limits;
                            const char *t;
                            limits = new char[strlen(limit_info.c_str()) + 1];
                            strcpy(limits, limit_info.c_str());

                            t = strtok(limits, ",");
                            sscanf(t + 1, "%d", &tnum_prod);

                            if(!get_limits(tnum_prod)) {
                                TREG_ERROR::error("TREG: Test number '%s' specified in file %s in TRIM_GRP [%s] for TRIM '%s' does not exists.\n",
                                                  limit_info.c_str(), file_name, p, p_trim);
                                return false;
                            }

                            t = strtok(NULL, ",");
                            if(t && *t == '#') {
                                sscanf(t + 1, "%d", &tnum_char);

                                if(!get_limits(tnum_char)) {
                                    TREG_ERROR::error("TREG: Test number '%s' specified in file %s in TRIM_GRP [%s] for TRIM '%s' does not exists.\n",
                                                      limit_info.c_str(), file_name, p, p_trim);
                                    return false;
                                }
                            }

                            delete [] limits;
#endif
                        } else {
                            char *limits;
							char *next_token=NULL;
                            limits = new char[strlen(limit_info.c_str()) + 1];
							strcpy_s(limits, strlen(limit_info.c_str()) + 1, limit_info.c_str());
                            err = parser.parse(strtok_s(limits, ",", &next_token), &lsl);
                            if(!err.empty()) {
                                TREG_ERROR::error("TREG: %s while parsing lower spec limit for TRIM '%s' in TRIM_GRP [%s] in file %s.",
                                                  err.c_str(), p_trim, p, file_name);
                                return false;
                            }
                            err = parser.parse(strtok_s(NULL, ",", &next_token), &usl);
                            if(!err.empty()) {
                                TREG_ERROR::error("TREG: %s while parsing upper spec limit for TRIM '%s' in TRIM_GRP [%s] in file %s.",
                                                  err.c_str(), p_trim, p, file_name);
                                return false;
                            }
                            delete [] limits;
                        }
                    }

                    // swap limits
                    if(lsl > usl) {
                        double temp_limit = usl;
                        usl = lsl;
                        lsl = temp_limit;
                    }

                    if(strrchr(key->getName(), ':')) {
                        while(*p_trim != ':' && *p_trim != '\0') p_trim++;     // step forward to ':'
                        while(!isalnum(*p_trim) && *p_trim != '\0') p_trim++;  // step forward to next alphanumeric character

                        if(trim.find(p_trim)) {
                            TRIM_LINK *link;
                            link = node->add_new(p_trim);

                            delete link->link;
                            link->link_default = false;
                            link->link = &trim(p_trim);
#ifdef TREG_ETS364
                            if(link->link->tnum_target > 0) // if trim prameter has a test# defined as target get limits from there
                                get_limits(link->link->tnum_target, &lsl, &usl);
#endif
                            link->upper_spec_limit = usl;
                            link->lower_spec_limit = lsl;
                            link->calc_norm_parameters();
                            link->tnum_prod = tnum_prod;
                            link->tnum_char = tnum_char;
                        } else {
                            TREG_ERROR::error("TREG: Adding '%s' to TRIM_GRP [%s] failed. Please define '%s' as TRIM in file %s.\n",
                                              p_trim, p, p_trim, file_name);
                            return false;
                        }
                    }
                }

                // LINK TRIM PARAMETERS BY USING THE SAME MEMORY FOR STORAGE (working, read_back, saved, start etc....)
                if(is_linked_group) {                                   // check if parameters of this group are linked
                    TRIM_NODE *base_node_pnt = &trim_grp(p + 1)[0];     // get pointer to first member in TRIM_GRP

                    for(unsigned i = 1; i < trim_grp(p + 1).count(); i++) {
                        TRIM_NODE *temp_node_pnt = &trim_grp(p + 1)[i]; // get pointer to member X in TRIM_GRP
                        if(temp_node_pnt != base_node_pnt) {
                            temp_node_pnt->nom_step = base_node_pnt->nom_step;                   // ensure that default step from first parameter is used
                            temp_node_pnt->learned_start_step = base_node_pnt->learned_start_step;
                            temp_node_pnt->free_storage_memory();                                // free memory
                            temp_node_pnt->start            = base_node_pnt->start;              // bend pointer over to first TRIM_GRP_NODE (Link node memory)
                            temp_node_pnt->read_back        = base_node_pnt->read_back;          // bend pointer over to first TRIM_GRP_NODE (Link node memory)
                            temp_node_pnt->working          = base_node_pnt->working;            // bend pointer over to first TRIM_GRP_NODE (Link node memory)
                            temp_node_pnt->programmed       = base_node_pnt->programmed;         // bend pointer over to first TRIM_GRP_NODE (Link node memory)
                            temp_node_pnt->saved            = base_node_pnt->saved;              // bend pointer over to first TRIM_GRP_NODE (Link node memory)
                            temp_node_pnt->internal_storage = base_node_pnt->internal_storage;   // bend pointer over to first TRIM_GRP_NODE (Link node memory)
                        }
                    }
                }
            }
            break;
        }
    }

    // read global settings from DEFAULT section
    bool flag = false; unsigned i;
    // check for 'use_mslogdata'
    reader.getBoolean(_DEFAULT, "use_mslogdata", &flag);
    for(i = 0; i < trim.count(); i++)
        trim[i].use_msLogData = flag;

    // check for 'char_on_wafer_change'
    reader.getBoolean(_DEFAULT, "char_on_wafer_change", &trim.char_on_wafer_change);

    // enable experimental features
    flag = false;
    reader.getBoolean(_DEFAULT, "enable_experimental", &flag);
    for(i = 0; i < trim.count(); i++)
        trim[i].enable_experimental = flag;
    
    PRINT("\n");
    PRINT("=================== TREG initialization =================== \n");
    PRINT("  File Name:                          %s   \n", file_name);
    PRINT("  Number of Trim Parameters:          %d   \n", trim.count());
    PRINT("  Number of Trim Groups:              %d   \n", trim_grp.count());
    PRINT("  Number of Selection Parameter:      %d   \n", sel.count());
    PRINT("  Number of Assemblies:               %d   \n", assy.count());
    PRINT("  Number of Assembly Groups:          %d   \n", assy_grp.count());
    PRINT("=========================================================== \n\n");

    return true;
}

void TREG::sot() {
    sel.sot();
    trim.sot();
}

void TREG::eot() {
    trim.eot();
}

void TREG::set_trim_allowed(bool turn_on, int site) {
    trim.set_trim_allowed(turn_on, site);
}

void TREG::force_table_char_active(bool activate) {
    trim.force_table_char_active(activate);
}

void TREG::set_table_char_active(bool activate) {
    trim.set_table_char_active(activate);
}

void TREG::force_post_measurement(bool activate) {
    trim.force_post_measurement(activate);
}

// searches through the whole TREG and returns a number based on the location it was found in
// 0 = not found
// 1 = found in ASSY_GRP
// 2 = found in ASSY
// 3 = found in TRIM_GRP
// 4 = found in TRIM
// 5 = found in SEL
unsigned TREG::find(const char *label) {

    ASSY_GRP_NODE   *assy_grp_pointer;
    ASSY_NODE       *assy_pointer;
    TRIM_NODE       *trim_pointer;
    TRIM_GRP_NODE   *trim_grp_pointer;
    SEL_NODE        *sel_pointer;

    if(strcmp(label, "") == 0)
        return FOUND_NOWEHRE;

    //-------- Search in Assy_Group ---------
    assy_grp_pointer = assy_grp.find(label);
    if(assy_grp_pointer)
        return FOUND_ASSY_GRP;

    //-------- Search in Assy ---------
    assy_pointer = assy.find(label);
    if(assy_pointer)
        return FOUND_ASSY;

    // -------- Search in Trim Group ---------
    trim_grp_pointer = trim_grp.find(label);
    if(trim_grp_pointer)
        return FOUND_TRIM_GRP;

    // -------- Search in Trim ---------
    trim_pointer = trim.find(label);
    if(trim_pointer)
        return FOUND_TRIM;

    // -------- Search in Sel ---------
    sel_pointer = sel.find(label);
    if(sel_pointer)
        return FOUND_SEL;

    return FOUND_NOWEHRE;   // returns 0 if label was not found
}

void TREG::register_error_func(void (*func)(const char *)) {
    err.register_error_func(func);
}

void TREG::register_dlog_func(void (*func)(unsigned tnum, double value, int site)) {
    dlog.register_dlog_func(func);
}
