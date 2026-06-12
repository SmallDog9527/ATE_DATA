/*****************************************************************************
*                                                                            *
*       Source title:   treg.h                                               *
*                       (test registor manage for trimming)                  *
*         Modify by:   SC TE                                                 *
*        Description:  Thx All Contributors                                  *
*                                                                            *
*   Revision History:                                                        *
*                                                                            *
*     mm/dd/yy  r.rr  - Original coding.                                     *
*                                                                            *
*****************************************************************************/

/*
 REVISION BLOCK:
 -Rev. -- Date --------------------------------------------------
  x		 --------  Long history with no record
  x+00   08/20/18  Add QC and DO_TRIM judge in execute, the flag input from init();
  x+01   10/31/18  Fix TREG::find(const char *label) issue
  x+02   12/05/18  MAX_TRIM change from 256 to 512
 ----------------------------------------------------------------
*/

#if !defined(__TREG)
#define __TREG

#define  WIN32_LEAN_AND_MEAN             // Exclude rarely-used stuff from Windows headers

#include <stdlib.h>
#include <stdio.h>
#include <float.h>
#include <math.h>
#include <assert.h>
#include <limits.h>
#include "SPEC.h"

#ifdef WIN32    // windows operating systems
#   include <windows.h>
#   include <direct.h>
#else           // linux & solaris operating systems
#   include <string.h>
#   include <ctype.h>

#   define _vsnprintf vsnprintf
#   define _snprintf  snprintf
#   define _stricmp   strcasecmp
#endif

// Disable warnings produced by VC 6.0
#if defined( _MSC_VER ) && (_MSC_VER <= 1200)    // 1200 = MSVC 6.0.
#   undef copy  // undefine copy macro imported by 'util.h' from ETS shell
#   pragma once
#   pragma warning(push, 3)
#   pragma warning(disable: 4018)    // signed/unsigned mismatch.
#   pragma warning(disable: 4146)    // unary minus operator applied to unsigned type, result still unsigned.

#   include <vector>
#   include <string>

#   pragma warning(pop)
#else
#   include <vector>
#   include <string>
#endif    // _MSC_VER <= 1200

#include <algorithm>
#   define MS_ALL        -1
#   define MS_MAX_SITES  64
#   define INT64         long
#   define PRINT         printf
typedef struct results_str {
    int resource;
    int site;
    double value;
    int PassFail;
} RESULTS_STR;

#ifdef DLL_MODE
#   define MS_ALL        -1
#   define MS_MAX_SITES  64
#   define INT64         long
#   define PRINT         printf

typedef struct results_str {
    int resource;
    int site;
    double value;
    int PassFail;
} RESULTS_STR;

#else
//#   include "cdef500d.h"
//#   include "testmain.h"
//#   include "util.h"
//#   include "tishell.h"

//#   define PRINT etsprintf
#endif

#ifdef ETS_VERSION_MAJOR
#   define TREG_ETS364
#endif

#ifdef TREG_ETS364
typedef int (*get_limits_t)(int tnum,double *lolim,double *hilim,char *text,int len,
                          char *unit,int unit_len,double *sc);
typedef void (*log_data_t)(int site, char *label, double lolim, double hilim, double val,
                          char *unitbase, int no_scaling);
typedef void (*test_t)(int tnum,double res,int site,int alarm_log);
#endif

enum TREG_FOUND_FLAG {
    FOUND_NOWEHRE,  // 0 = not found
    FOUND_ASSY_GRP, // 1 = found in ASSY_GRP
    FOUND_ASSY,     // 2 = found in ASSY
    FOUND_TRIM_GRP, // 3 = found in TRIM_GRP
    FOUND_TRIM,     // 4 = found in TRIM
    FOUND_SEL       // 5 = found in SEL
};

enum TREG_MEASURE_FLAG {
    TREG_MEASURE_NONE = -1,
    TREG_MEASURE_CHAR,
    TREG_MEASURE_PRE,
    TREG_MEASURE_POST,
    TREG_MEASURE_RETRY
};

enum TREG_LOGLEVEL {
    TREG_LOG_STD   = 0x0000,    // standard datalogging
    TREG_LOG_DELTA = 0x0001,    // log delta to target absolute and in %
    TREG_LOG_DEBUG = 0x0002,    // debug print output of trim table on screen
    TREG_LOG_TABLE = 0x0004     // log trim table during characterization
};

extern bool dll_active_sites[];

///////////////////////////////////////////////////////////////////////////////
// Global defines
#define MAX_TRIM                    512     // maximum number of trim steps
#define STEP_STR_BUF_SIZE           3 + 1   // size of buffer for string conversion of the variable 'steps'. Has to be 'number of digits"(MAX_TRIM) + 1 
#define TRIM_STEP_ADJ_DEPTH         200     // number of units for running average of trim step learning
#define TRIM_START_ADJ_DEPTH        100     // max value of histogram / maximum number of trims to swap over from one default to an other one
#define PREDICTABILITY_BUFFER_SIZE  (TREG::num_sites() * (4 + 1)) // make sure predictability buffer size is large enough (quartile > NUM_SITES)

#define _DEFAULT                    "DEFAULT"

#define TRIM_START_LEARN_DEFAULT    20
#define TRIM_STEP_LEARN_DEFAULT     50
#define TRIM_STEP_CHAR_DEFAULT      30

class TRIM_GRP_NODE;
typedef double(*TrimGrpErrorFunc)(TRIM_GRP_NODE &trim_grp, unsigned site);

using namespace std;

///////////////////////////////////////////////////////////////////////////////
// TREG_RESULTS 2-dimensional array used in TRIM_GRP_NODE::execute()
typedef vector<vector<double> > TREG_RESULTS;

#if defined( _MSC_VER ) && (_MSC_VER <= 1200)    // 1200 = MSVC 6.0.
#   define copy copy2    // define it back as in 'util.h'
#endif

///////////////////////////////////////////////////////////////////////////////
// TREG_ERROR class
class TREG_ERROR {
    friend class TREG;
public:
    TREG_ERROR();
    ~TREG_ERROR();
    static void error(const char *msg, ...);
private:
    void register_error_func(void (*func)(const char *));
    static void (*error_func)(const char *);
};

///////////////////////////////////////////////////////////////////////////////
// TREG_LOG class
class TREG_LOG {
    friend class TREG;
    friend class TRIM_NODE;
    friend class TRIM_GRP_NODE;
public:
    TREG_LOG();
    ~TREG_LOG();
private:
    static void log_data(unsigned tnum, unsigned index, double value, int site, bool use_mslogdata, bool allow_mslogdata, 
                         string testname = "", double ll = FLT_MAX, double ul = FLT_MAX, const char *unit = NULL);
    void register_dlog_func(void (*func)(unsigned tnum, double value, int site));
    static void (*datalog_func)(unsigned tnum, double value, int site);
};

///////////////////////////////////////////////////////////////////////////////
// TREG_LIST template class
template <class T>
class TREG_LIST {
    friend class TREG;
    friend class TRIM;
    friend class TRIM_GRP;
    friend class TRIM_GRP_NODE;
    friend class ASSY;
    friend class ASSY_NODE;
    friend class ASSY_GRP_NODE;
public:
    T &operator()(const char *name) {  // access an individual node by name
        T *node = NULL;
        bool error = false;

        node = find(name, false);
        if(!node)
            node = (*this).add_new(name, false);

        if(!node->valid)
            error = true;

        if(error)
            TREG_ERROR::error("TREG: Element with name '%s' does not exist.", name);

        return *node;
    }

    T &operator[](unsigned index) {  // access an individual node by index (array-like)
        T *node = NULL;
        bool error = false;
        unsigned i = index;

        if(i < 0 || i >= count() || !root_node) {
            node = find("__treg_invalid", false);
            if(!node)
                node = (*this).add_new("__treg_invalid", false);
        } else {
            node = root_node;
            while(i) {
                if(node->valid)
                    i--;
                node = node->next_node;
            }
        }

        if(!node->valid)
            error = true;

        if(error)
            TREG_ERROR::error("TREG: Element at index [%d] does not exist.", index);

        return *node;
    }

    unsigned count() {
        return cnt;
    }

    void sot() {
        T *node = root_node;
        while(node) {
            if(node->valid)
                node->sot();
            node = node->next_node;
        }
    }

    void eot() {
        T *node = root_node;
        while(node) {
            if(node->valid)
                node->eot();
            node = node->next_node;
        }
    }

protected:
    TREG_LIST() {
        root_node = NULL;
        size = cnt = 0;
    }

    ~TREG_LIST() {
        T *node = root_node;
        if(root_node) {
            while(node->next_node)
                node = node->next_node;
            while(node != root_node) {
                node = node->pre_node;
                delete(node->next_node);
                node->next_node = NULL;
            }
            delete root_node;
            root_node = NULL;
            size = cnt = 0;
        }
    }

private:
    T *add_new(const char *name, bool valid = true) {
        T *node = root_node;
        T *return_node = NULL;
        if(root_node) {
            while(node->next_node)
                node = node->next_node;
            node->next_node = new T;
            node->next_node->pre_node = node;
            node->next_node->next_node = NULL;
            node->next_node->name = name;
            node->next_node->valid = valid;
            return_node = node->next_node;
        } else {
            root_node = new T;
            root_node->pre_node = NULL;
            root_node->next_node = NULL;
            root_node->name = name;
            root_node->valid = valid;
            return_node = root_node;
        }
        if(valid)
            cnt++;
        size++;
        return return_node;
    }

    T *find(const char *name, bool valid_only = true) {
        T *node = root_node;
        T *found = NULL;

        while(node) {
            if(node->name == name) {
                if(!valid_only) {
                    found = node; break;
                } else if(node->valid) {
                    found = node; break;
                }
            }
            node = node->next_node;
        }
        return found;
    }

    void remove(const char *name) {
        T *node = NULL;

        node = find(name);
        if(node) {
            if(node != root_node) { 
                if(node->pre_node)
                    node->pre_node->next_node = node->next_node;
                if(node->next_node)
                    node->next_node->pre_node = node->pre_node;
            } else { // first element in double-linked-list to be deleted
                if(node->next_node) {
                    node->next_node->pre_node = NULL;
                    root_node = node->next_node;
                } else
                    root_node = NULL;
            }
            delete node;
            node = NULL;
            size--;
            cnt--;
        }
    }

    unsigned size;  // number of all list members (including invalid entries)
    unsigned cnt;   // number of vaild list members
    T *root_node;
};

///////////////////////////////////////////////////////////////////////////////
// TREG_LIST_MEMBER template class
template <class T>
class TREG_LIST_MEMBER {
    friend class TREG;
    friend class TRIM;
    friend class TRIM_LINK;
    friend class ASSY;
    friend class ASSY_NODE;
    friend class ASSY_GRP_NODE;
    friend class TREG_LIST<T>;
public:
    const char *get_name() {return name.c_str();};
    const char *get_node_name() {return name.c_str();}; // kept for compatibility
private:
    string name;    // name of the list member
    bool valid;     // true if a valid list member
    T *next_node;   // pointer to next list member
    T *pre_node;    // pointer to previous list member
};

///////////////////////////////////////////////////////////////////////////////
// STORAGE class
class STORAGE {
    friend class ASSY_BIT;
    friend class ASSY_NODE;
    friend class TRIM_NODE;
    friend class TRIM_GRP_NODE;
    friend class TRIM_LINK;
    friend class SEL_NODE;
    friend class TREG;
public:
    unsigned    get_working(int site);                              // receive working values from class
    unsigned    get_programmed(int site);                           // receive programmed values from class
    unsigned    get_read_back(int site);                            // receive read_back values from class
    unsigned    get_saved(int site);                                // receive saved values from class
    unsigned    get_start(int site);                                // receive start values from class

    void        set_working(unsigned value, int site = MS_ALL);     // set working values in class
    void        set_programmed(unsigned value, int site = MS_ALL);  // set working values in class
    void        set_read_back(unsigned value, int site = MS_ALL);   // set read_back values in class
    void        set_saved(unsigned value, int site = MS_ALL);       // set saved values in class

    void        save_working(int site = MS_ALL);                    // copies working into saved
    void        save_read_back(int site = MS_ALL);                  // copies read_back into saved
    void        restore_working(int site = MS_ALL);                 // copies saved into working
    void        restore_read_back(int site = MS_ALL);               // copies saved into read_back

    void        copy_prog_to_work(int site = MS_ALL);               // copies programmed into working
    void        copy_read_to_work(int site = MS_ALL);               // copies read_back into working
    void        copy_start_to_work(int site = MS_ALL);              // copies start into working

    void        copy_work_to_prog(int site = MS_ALL);               // copies working into programmed
    void        copy_read_to_prog(int site = MS_ALL);               // copies read_back into programmed
    void        copy_start_to_prog(int site = MS_ALL);              // copies start into programmed

    void        copy_work_to_read(int site = MS_ALL);               // copies working into read_back
    void        copy_prog_to_read(int site = MS_ALL);               // copies read_back into read_back
    void        copy_start_to_read(int site = MS_ALL);              // copies start into read_back

private:
    unsigned    *start;                                             // start value after SOT()
    unsigned    *read_back;                                         // stores the bits read back during EEPROM read
    unsigned    *working;                                           // working copy
    unsigned    *programmed;                                        // programmed content
    unsigned    *saved;                                             // used as temporary storage for working, etc...
    unsigned    *internal_storage;                                  // for internal use only

    bool        storage_allocated;                                  // indicates if memory is allocated for start, readback, working, etc.....
    void        free_storage_memory();

    int         treg_site;

    STORAGE();
    ~STORAGE();
};

///////////////////////////////////////////////////////////////////////////////
// TRIM_STEP_HIST class
class TRIM_STEP_HIST {
public:
    double      get_avg() {return average_value;};                                  // running average
    void        set_avg(double value) {average_value = value;};                     // set averge value
    void        init(unsigned history_depth);
    void        calc_avg();
    void        put_char_table_value(double value, int site);
    double      get_char_table_value(int site);
    void        clear_char_table_value(int site);
    void        filter_outliers();
    void        update_history(double value);                                       // removes old hist value, adds new value and updates average
    void        fill_table(double value);                                           // fills table with value
    bool        value_received(int site);
    void        reset_history_index() {hist_index = 0;};

    unsigned    units_measured;

    TRIM_STEP_HIST();
    ~TRIM_STEP_HIST();
private:
    double      step_value[MS_MAX_SITES];                                           // storage location for table char values
    bool        step_value_received[MS_MAX_SITES];                                  // indicates if value for this trim step was measured

    double      average_value;                                                      // stores average value
    unsigned    hist_index;                                                         // history ring buffer index
    unsigned    hist_depth;                                                         // number of units used for running average
    double      history[TRIM_STEP_ADJ_DEPTH];                                       // ring buffer
    bool        valid_hist_value[TRIM_STEP_ADJ_DEPTH];

    int         treg_site;
};

///////////////////////////////////////////////////////////////////////////////
// TRIM_BASE class -> merged into TRIM_NODE
typedef TRIM_NODE TRIM_BASE; // for compatibility

///////////////////////////////////////////////////////////////////////////////
// TRIM_NODE class
class TRIM_NODE : public TREG_LIST_MEMBER<TRIM_NODE> , public STORAGE {
    friend class TREG;
    friend class TRIM;
    friend class TRIM_GRP_NODE;
public:
    bool        table_char_active();                                                // is true if there are still units to be characterized
    void        table_char(double trim_step_value, unsigned trim_step, int site);   // used for trim table learning
    void        table_char(RESULTS_STR *trim_step_values, unsigned trim_step);      // used for trim table learning
    void        table_char(double *trim_step_values, unsigned trim_step);           // used for trim table learning

    void        pre(double pre_value, int site, double trim_hysteresis_pcnt = 0.0); // updates working values based on parameter value
    void        pre(RESULTS_STR *pre_values, double trim_hysteresis_pcnt = 0.0);    // updates working values based on parameter value
    void        pre(double *pre_value, double trim_hysteresis_pcnt = 0.0);          // updates working values based on parameter value
    void        set_pre_reading(double value, int site);
    void        set_pre_reading(double *values);
    void        set_pre_reading(RESULTS_STR *values);

    void        post(double value, int site);                                       // passes back measured values after trimming (required for learning)
    void        post(RESULTS_STR *values);                                          // passes back measured values after trimming (required for learning)
    void        post(double *values);                                               // passes back measured values after trimming (required for learning)
    void        sot();                                                              // copy trim start value into working
    void        eot();                                                              // process trim data (adaptive trim learning)

    void        set_target(double target_value, int site = MS_ALL);                 // set trim target
    double      get_target(int site);                                               // returns trim target for site

    void        set_trim_type(const char* type);                                    // set trim_type of parameter. Valid values are 'min', 'nom' and 'max'
    const char  *get_trim_type() {return trim_type.c_str();};                       // get trim_type of parameter.

    unsigned    get_steps() {return steps;};                                        // returns number of trim steps (for characterisation)
    bool        trim_step_enabled(unsigned step_number) {return step_enabled[step_number];};    // returns true if trim step is enabled and can be used
    void        enable_trim_step(unsigned step_number) {step_enabled[step_number] = true;};     // enable a trim step
    void        disable_trim_step(unsigned step_number) {step_enabled[step_number] = false;};   // disable a trim step
    double      get_table_value(unsigned step_number) {return table[step_number];};             // returns trim table content
    double      get_learn_table_value(unsigned step_number) {return learn_table[step_number].get_avg();};   // returns trim learn table content
    double      get_guessed_final(int site, int trim_step = -1);                    // returnes estimated values after trim. If trim step is not specified the step determined by pre() will be used.
    double      get_pre_reading(int site);                                          // returns measurement value of measurement before trim
    double      get_post_reading(int site);                                         // returns measurement value of measurement after trim
    bool        updated_by_trim(int site = MS_ALL);                                 // returns 'true' if trim bits have been changed by 'pre()'

    void        set_trim_allowed(bool turn_on, int site = MS_ALL);                  // activates and disables trimming. If disabled value from "programmed" is copied into working
    bool        get_trim_allowed(int site = MS_ALL);                                // returns 'true' if trim is active for the given site or for at least one site
    void        force_table_char_active(bool activate) {table_char_always_on = activate;};      // forces table_char to be always on.
    void        set_table_char_active(bool activate) {table_char_on = activate;};   // activates and disables table_char.
    void        restart_table_char();                                               // restart trim table characterization
    bool        start_learn_valid();                                                // returns 'true' if sufficient data points have been collected to be able to adjust start value
    void        force_post_measurement(bool activate) {allow_skip_post_measurement = !activate;};   // forces post trim measurement to be always executed.

    void        set_learn_trim_start(unsigned value);   // sets number of times a trim bit has to be used till the default trim bit will be changed (0 = default learn disabled)
    void        set_learn_trim_step(unsigned value);    // number of units that will be averaged to calculate the trim step  (0 = step learn disabled)
    void        set_learn_trim_char(unsigned value);    // number of untis a full trim table char is performed (0 = table char disabled)
    double      calc_rel_step_estimate(unsigned trim1, unsigned trim2);
    double      calc_abs_step_estimate(unsigned trim1, unsigned trim2);
    double      calc_estimate(int site);
    double      calc_estimate(int site, unsigned new_step);
    double      calc_estimate(int site, unsigned new_step, double old_value, unsigned old_step);
    void        set_guessed_final(double guessed_value, int site, int step) {guessed_final[site][step] = guessed_value;}; // sets the guessed_final value

    void        set_base_unit(const char *unit) {base_unit_target = unit;};
    const char  *get_base_unit() {return base_unit_target.c_str();};

    unsigned    get_retry_cnt() {return retry_cnt;};                                // returns number of tried re-trims
    void        execute(void(*measure_func)(TRIM_NODE *trim_node, TREG_MEASURE_FLAG treg_measure_flag, double *results),
                        int tnum_prod, int tnum_char = -1, int log_level = TREG_LOG_STD, double trim_hysteresis_pcnt = 0.0, 
                        unsigned max_retry_cnt = 0);
    void        execute(void(*measure_func)(TRIM_NODE *trim_node, TREG_MEASURE_FLAG treg_measure_flag, double *results),	// lzg
                        SPEC& spec, short funcindex, LPCTSTR funclabel, double unit_scale = 1);
    TRIM_NODE();
    ~TRIM_NODE();
private:
    void        init(string tr_table);
    void        init_learn_table();
    unsigned    find_best_step(unsigned old_step, double old_value, double &calc_new_value, int site);
    bool        unit_passed(int site);                                              // returns true if unit passed
    bool        all_steps_received(int site);                                       // returns true if char results were received for each trim step
    bool        trim_type_exists(const char *type);                                 // returns true if trim type is 'min', 'nom' or 'max'
    void        update_predictability(int site);
    bool        check_predictability();                                             // returns true if trim predictability is good
    void        calc_expected_range(double *values, unsigned cnt, double *min, double *max);

    bool        print_learn_table_header;
    double      guessed_final[MS_MAX_SITES][MAX_TRIM];                              // estimated trim result
    unsigned    steps;                                                              // number of steps on this trim parameter
    unsigned    nom_step;                                                           // nominal trim step
    unsigned    learned_start_step;                                                 // learned start trim step
    bool        trim_value_changed[MS_MAX_SITES];                                   // indicates if working value got updated by trimming routine
    double      table[MAX_TRIM];                                                    // nominal trim steps
    bool        step_enabled[MAX_TRIM];                                             // indicates if trim step is enabled
    double      target[MS_MAX_SITES];                                               // trim target
    double      sot_target;                                                         // target set after SOT
    string      base_unit_target;                                                   // stores the base unit used in target definition of the trim parameter (e.g. V, A, HZ, OHM, DB, etc....)
    string      trim_type;                                                          // min, nom, max trimming
    bool        trim_rel_mode;                                                      // true = rel trimming / false = abs trimming
    unsigned    retry_cnt;                                                          // number of re-trims tried

    // statistics about best trim values
    unsigned    learn_trim_start;                                                   // if > 0 trim start adjust is active. Value is number of units delay before learning is active
    unsigned    learn_trim_step;                                                    // if > 0 trim step learning is active. Value is number of units that are used to calculate a running average
    unsigned    table_char_units_remaining;                                         // remaining number of units to be characterized
    unsigned    table_char_units;                                                   // number of units to be characterized
    unsigned    performed_trims[MAX_TRIM];
    bool        learn_trim_start_valid;                                             // true as soon as one step has been used more than 'learn_trim_start' times

    // statistics about last trim
    unsigned    first_pre_trimming[MS_MAX_SITES];                                   // stores trim bits before first pre() function call
    unsigned    pre_trimming[MS_MAX_SITES];                                         // stores trim bits before pre() function call
    double      first_pre_reading[MS_MAX_SITES];                                    // trim parameter value before first execution of pre()
    double      pre_reading[MS_MAX_SITES];                                          // trim parameter value before last execution of pre()
    bool        pre_measured[MS_MAX_SITES];                                         // true if pre() has been executed
    unsigned    post_trimming[MS_MAX_SITES];                                        // stores trim bits before post() function call
    double      post_reading[MS_MAX_SITES];                                         // reading after trim
    bool        post_measured[MS_MAX_SITES];                                        // indicates if post() has been executed

    int         tnum_target;

    TRIM_STEP_HIST learn_table[MAX_TRIM];

    // statistics for predictability monitoring
    double      min_measured[TRIM_STEP_ADJ_DEPTH];
    double      max_measured[TRIM_STEP_ADJ_DEPTH];
    
    struct {
        double min;
        double max;
    } expected_range;

    struct PRED_STRUCT {
        double      value[MS_MAX_SITES * (4 + 1)];  // 4 quartiles
        unsigned    index;
        unsigned    cnt;
        unsigned    size;
        double      lower_limit;
        double      upper_limit;
    } predictability;

    // some flags
    bool        trim_is_active[MS_MAX_SITES];
    bool        table_char_always_on;
    bool        table_char_on;
    bool        allow_skip_post_measurement;
    bool        use_msLogData;
    bool        enable_experimental;
    bool        debug;
	bool		QC;
	bool		DO_TRIM;

    int         treg_site;
};

///////////////////////////////////////////////////////////////////////////////
// TRIM class
class TRIM : public TREG_LIST<TRIM_NODE> {
    friend class TREG;
public:
    void        sot();                                              // start of test function: initialize everything for the next test run
    void        eot();                                              // end of test function: process trim data for all TRIM parameters (adaptive trim learning)
    void        set_trim_allowed(bool turn_on, int site = MS_ALL);  // activates and disables trimming. If disabled value from "programmed" is copied into working
    void        force_table_char_active(bool activate);             // forces table_char to be always on.
    void        set_table_char_active(bool activate);               // activates and disables table_char.
    void        set_learn_trim_start(unsigned value);               // sets number of times a trim bit has to be used till the default trim bit will be changed (0 =  default learn disabled)
    void        set_learn_trim_step(unsigned value);                // number of units that will be averaged to calculate the trim step  (0 =  step learn disabled)
    void        set_learn_trim_char(unsigned value);                // number of untis a full trim table char is performed (0 = table char disabled)
    void        force_post_measurement(bool activate);              // forces post trim measurement to be always executed.

    bool        start_learn_valid();                                // returns 'true' if sufficient data points have been collected for all parameters to be able to adjust start value
    bool        table_char_active();                                // returns 'true' if there are still units to be characterized
    void        restart_table_char();                               // restart trim table characterization
    bool        initial_learn_completed() {return (start_learn_valid() && !table_char_active());}; // returns 'true' if table_char and default adjust are completed

    void        print_learn_table();                                // writes the learned trim table into a cvs file (to check how the trim learning behaves)

private:
    TRIM();
    ~TRIM();
    void        init();

    unsigned    number_of_test_runs;
    int         num_units_sublot;
    bool        char_on_wafer_change;
    int         treg_site;
};

///////////////////////////////////////////////////////////////////////////////
// TRIM_LINK class
class TRIM_LINK : public TREG_LIST_MEMBER<TRIM_LINK> {
    friend class TREG;
    friend class TRIM_GRP_NODE;
public:
    double      get_lower_spec() {return lower_spec_limit;};        // returns the lower spec limit of the TRIM specified in the *.treg file
    double      get_upper_spec() {return upper_spec_limit;};        // returns the upper spec limit of the TRIM specified in the *.treg file
    void        set_lower_spec(double low_spec);                    // sets the lower spec limit of the TRIM specified in the *.treg file
    void        set_upper_spec(double up_spec);                     // sets the upper spec limit of the TRIM specified in the *.treg file
    void        set_spec(double low_spec, double up_spec);          // sets the spec limits for a certain parameter
#ifdef TREG_ETS364
    void        set_spec(int test_list_test_number);                // sets the spec limits for a certain parameter
    void        set_test_num(int prod_test_number, int char_test_number = -1); // sets the test numbers for production/characterization test
#endif
    double      normalize_value_squared(double value);
    double      get_normalized_error_squared(int site);

    TRIM_LINK();
    ~TRIM_LINK();

private:
    void        recursive(TRIM_GRP_NODE *trim_node, double *smallest_error, TrimGrpErrorFunc user_error_func, int site);

    double      lower_spec_limit;
    double      upper_spec_limit;
    int         tnum_prod;                                          // production test number
    int         tnum_char;                                          // characterization test number

    double      norm_offset;                                        // offset to normalize values according to spec
    double      norm_factor;                                        // gain factor to normalize values according to spec

    void        calc_norm_parameters();

    TRIM_NODE   *link;
    bool        link_default;
};

///////////////////////////////////////////////////////////////////////////////
// TRIM_GRP_NODE class
class TRIM_GRP_NODE : public TREG_LIST_MEMBER<TRIM_GRP_NODE> , public TREG_LIST<TRIM_LINK> {
    friend class TREG;
public:
    void        pre(TrimGrpErrorFunc user_error_func);
    void        pre();
    bool        updated_by_trim(int site = MS_ALL);     // returns 'true' if trim bits have been changed by 'pre()'
    unsigned    get_retry_cnt() {return retry_cnt;};    // returns number of tried re-trims

    TRIM_NODE   &operator[](unsigned index);            // access an individual TRIM node in an array like style
    TRIM_LINK   &operator()(unsigned index);            // access an individual TRIM node based on the nodes name

    void        execute(void(*measure_func)(TRIM_GRP_NODE *trim_grp_node, TREG_MEASURE_FLAG treg_measure_flag,
                        TREG_RESULTS &meas_results), int log_level = TREG_LOG_STD,
                        TrimGrpErrorFunc user_error_func = NULL, double trim_hysteresis_pcnt = 0.0, unsigned max_retry_cnt = 0);
    TRIM_GRP_NODE();
    ~TRIM_GRP_NODE();
private:
    bool        is_linked_group;  // true if all trims are sharing the same bits
    bool        is_measure_group; // true if measurements are done at the same time but each parameter is trimmed individually
    unsigned    retry_cnt;        // number of re-trims tried
    int         treg_site;
};

///////////////////////////////////////////////////////////////////////////////
// TRIM_GRP class
class TRIM_GRP : public TREG_LIST<TRIM_GRP_NODE> {
    friend class TREG;
private:
    TRIM_GRP();
    ~TRIM_GRP();
};

///////////////////////////////////////////////////////////////////////////////
// SEL_NODE class
class SEL_NODE : public TREG_LIST_MEMBER<SEL_NODE> , public STORAGE {
    friend class TREG;
public:
    void set_start(unsigned value, int site = MS_ALL);  // sets the start value
    void sot();                                         // copies the start value for this node into working
    SEL_NODE();
    ~SEL_NODE();
};

///////////////////////////////////////////////////////////////////////////////
// SEL class
class SEL : public TREG_LIST<SEL_NODE> {
    friend class TREG;
private:
    SEL();
    ~SEL();
};

///////////////////////////////////////////////////////////////////////////////
// ASSY_BIT class
class ASSY_BIT : public TREG_LIST_MEMBER<ASSY_BIT> {
    friend class TREG;
    friend class ASSY;
    friend class ASSY_NODE;
    friend class ASSY_GRP_NODE;
public:
    INT64       get_working(int site);                              // receive working bit from class
    INT64       get_programmed(int site);                           // receive programmed bit from class
    INT64       get_read_back(int site);                            // receive read_back bit from class
    INT64       get_saved(int site);                                // receive saved bit from class
    INT64       get_start(int site);                                // receive start bit from class

    void        set_working(INT64 value,     int site = MS_ALL);    // set working bit in class
    void        set_programmed(INT64 value,  int site = MS_ALL);    // set programmed bit in class
    void        set_read_back(INT64 value,   int site = MS_ALL);    // set read_back bit in class
    void        set_saved(INT64 value,       int site = MS_ALL);    // set saved bit in class

    // copy bit content -----------------------------------------
    void        save_programmed();                                  // copies the programmed values into saved
    void        save_working();                                     // copies the working values into saved
    void        save_read_back();                                   // copies the read_back values into saved

    void        restore_programmed();                               // copies the saved values into programmed
    void        restore_working();                                  // copies the saved values into working
    void        restore_read_back();                                // copies the saved values into read_back

    void        copy_prog_to_work(int site = MS_ALL);               // copies programmed into working
    void        copy_read_to_work(int site = MS_ALL);               // copies read_back into working
    void        copy_start_to_work(int site = MS_ALL);              // copies start into working

    void        copy_work_to_prog(int site = MS_ALL);               // copies working into programmed
    void        copy_read_to_prog(int site = MS_ALL);               // copies read_back into programmed
    void        copy_start_to_prog(int site = MS_ALL);              // copies start into programmed

    void        copy_work_to_read(int site = MS_ALL);               // copies working into read_back
    void        copy_prog_to_read(int site = MS_ALL);               // copies read_back into read_back
    void        copy_start_to_read(int site = MS_ALL);              // copies start into read_back

    ASSY_BIT();
    ~ASSY_BIT();
private:
    void        init(unsigned assy_bit_pos, const char *param_bit_info);
    unsigned    pos_in_assy;
    INT64       assy_mask;

    unsigned    pos_in_param;
    unsigned    param_mask;
    STORAGE     *link;
    bool        link_default;
    bool        invert_bits;

    int         treg_site;
};

///////////////////////////////////////////////////////////////////////////////
// ASSY_NODE class
class ASSY_NODE : public TREG_LIST_MEMBER<ASSY_NODE> , public TREG_LIST<ASSY_BIT> {
    friend class TREG;
    friend class ASSY;
    friend class ASSY_GRP_NODE;
public:
    INT64       get_working(int site);                              // receive working values from class
    INT64       get_programmed(int site);                           // receive programmed values from class
    INT64       get_read_back(int site);                            // receive read_back values from class
    INT64       get_saved(int site);                                // receive saved values from class
    INT64       get_start(int site);                                // receive start values from class

    bool        parity_working_even(int site);                      // calculates even Parity bit of working
    bool        parity_working_odd(int site);                       // calculates odd Parity bit of working
    bool        parity_read_back_even(int site);                    // calculates even Parity bit of readback
    bool        parity_read_back_odd(int site);                     // calculates odd Parity bit of readback

    void        set_working(INT64 value, int site = MS_ALL);        // set working values in class
    void        set_read_back(INT64 value, int site = MS_ALL);      // set read_back values in class
    void        set_saved(INT64 value, int site = MS_ALL);          // set read_back values in class

    // copy from one location to an other one -----------------------
    void        sot(int site = MS_ALL);                             // copies the start values into working
    void        programmed(int site = MS_ALL);                      // copies the working values into programmed

    // compare assys content -------------------------------------
    bool        comp_prog(INT64 value, int site = MS_ALL);          // compares a unsigned value to programmed
    bool        comp_prog(char *value, int site = MS_ALL);          // compares a char string to programmed (kept for compatibility)
    bool        comp_prog(char const *value, int site = MS_ALL);    // compares a char string to programmed
    bool        comp_prog_to_read(int site = MS_ALL);               // compares the read_back value to programmed

    bool        comp_read(INT64 value, int site = MS_ALL);          // compares a unsigned value to read_back
    bool        comp_read(char *value, int site = MS_ALL);          // compares a char string to read_back (kept for compatibility)
    bool        comp_read(char const *value, int site = MS_ALL);    // compares a char string to read_back
    bool        comp_read_to_start(int site = MS_ALL);              // compares the read_back value to the start value
    bool        comp_read_to_work(int site = MS_ALL);               // compares the read_back value to the working value

    // copy assys content -----------------------------------------
    void        save_programmed();                                  // copies the programmed values into saved
    void        save_working();                                     // copies the working values into saved
    void        save_read_back();                                   // copies the read_back values into saved

    void        restore_programmed();                               // copies the saved values into programmed
    void        restore_working();                                  // copies the saved values into working
    void        restore_read_back();                                // copies the saved values into read_back

    void        copy_prog_to_work(int site = MS_ALL);               // copies programmed into working
    void        copy_read_to_work(int site = MS_ALL);               // copies read_back into working
    void        copy_start_to_work(int site = MS_ALL);              // copies start into working

    void        copy_work_to_prog(int site = MS_ALL);               // copies working into programmed
    void        copy_read_to_prog(int site = MS_ALL);               // copies read_back into programmed
    void        copy_start_to_prog(int site = MS_ALL);              // copies start into programmed

    void        copy_work_to_read(int site = MS_ALL);               // copies working into read_back
    void        copy_prog_to_read(int site = MS_ALL);               // copies read_back into read_back
    void        copy_start_to_read(int site = MS_ALL);              // copies start into read_back

    ASSY_NODE();
    ~ASSY_NODE();
private:
    bool        parity_even(int site, bool read_back);
    INT64       temp_storage[MS_MAX_SITES];
    int         treg_site;
};

///////////////////////////////////////////////////////////////////////////////
// ASSY class
class ASSY : public TREG_LIST<ASSY_NODE> {
    friend class TREG;
public:
    void        print(int site);                                                            // prints the current content of all ASSY in the "register.txt" file
    void        print(char *assy_name, int site = MS_ALL, bool override_file = true);       // prints the content of 'assy_name' to "register.txt" file (kept for compatibiliy)
    void        print(const char *assy_name, int site = MS_ALL, bool override_file = true); // prints the content of 'assy_name' to "register.txt" file
private:
    ASSY();
    ~ASSY();
    int treg_site;
};

///////////////////////////////////////////////////////////////////////////////
// ASSY_LINK class
class ASSY_LINK : public TREG_LIST_MEMBER<ASSY_LINK> {
    friend class TREG;
    friend class ASSY_GRP_NODE;
public:
    unsigned    assy_addr() { return assy_address;};                    // returns the address of the ASSY specified in the *.ini file
    const char  *get_vector_label() { return vector_label.c_str();};    // returns the optional vector label specified in the *.ini file
    ASSY_LINK();
    ~ASSY_LINK();
private:
    void        init(string address_info);

    string      vector_label;
    unsigned    assy_address;
    ASSY_NODE   *link;
    bool        link_default;
};

///////////////////////////////////////////////////////////////////////////////
// ASSY_GRP_NODE class
class ASSY_GRP_NODE : public TREG_LIST_MEMBER<ASSY_GRP_NODE> , public TREG_LIST<ASSY_LINK> {
    friend class TREG;
public:
    void        set_working(INT64 value, int site = MS_ALL);      // set working values in class
    void        set_read_back(INT64 value, int site = MS_ALL);    // set read_back values in class
    void        set_saved(INT64 value, int site = MS_ALL);        // set read_back values in class

    void        programmed(int site = MS_ALL);                    // copies the working values into programmed
    bool        comp_prog(char *value, int site = MS_ALL);        // compares value with content of programmed
    bool        comp_prog(char const *value, int site = MS_ALL);  // compares value with content of programmed (kept for compatibility)
    bool        comp_prog_to_read(int site = MS_ALL);             // compared read_back with programmed
    bool        comp_read(char *value, int site = MS_ALL);        // compares value with content of read_back
    bool        comp_read(char const *value, int site = MS_ALL);  // compares value with content of read_back (kept for compatibility)
    bool        comp_read_to_start(int site = MS_ALL);            // compared read_back with start
    bool        comp_read_to_work(int site = MS_ALL);             // compared read_back with working

    bool        parity_working_even(int site);                    // calculates even Parity bit of working
    bool        parity_working_odd(int site);                     // calculates odd Parity bit of working
    bool        parity_read_back_even(int site);                  // calculates even Parity bit of working
    bool        parity_read_back_odd(int site);                   // calculates odd Parity bit of working

    void        save_working();                                   // copies the working values into saved
    void        save_read_back();                                 // copies the read_back values into saved
    void        restore_working();                                // copies the saved values into working
    void        restore_read_back();                              // copies the saved values into read_back

    void        copy_prog_to_work(int site = MS_ALL);             // copies programmed into working
    void        copy_read_to_work(int site = MS_ALL);             // copies read_back into working
    void        copy_start_to_work(int site = MS_ALL);            // copies start into working

    void        copy_work_to_prog(int site = MS_ALL);             // copies working into programmed
    void        copy_read_to_prog(int site = MS_ALL);             // copies read_back into programmed
    void        copy_start_to_prog(int site = MS_ALL);            // copies start into programmed

    void        copy_work_to_read(int site = MS_ALL);             // copies working into read_back
    void        copy_prog_to_read(int site = MS_ALL);             // copies read_back into read_back
    void        copy_start_to_read(int site = MS_ALL);            // copies start into read_back

    ASSY_NODE   &operator[](unsigned assy_index);                 // access an individual ASSY node in an array like style
    ASSY_LINK   &operator()(unsigned assy_index);                 // access an individual ASSY node based on the nodes name

    ASSY_GRP_NODE();
    ~ASSY_GRP_NODE();
};

///////////////////////////////////////////////////////////////////////////////
// ASSY_GRP class
class ASSY_GRP : public TREG_LIST<ASSY_GRP_NODE> {
    friend class TREG;
private:
    ASSY_GRP();
    ~ASSY_GRP();
};

///////////////////////////////////////////////////////////////////////////////
// TREG class
class TREG {
public:
    TREG();
    ~TREG();

    TRIM        trim;                                       // Branch to TRIM parameters
    TRIM_GRP    trim_grp;                                   // Branch to Group of TRIM parameters with grouped trim functionality
    SEL         sel;                                        // Branch to SEL  parameters
    ASSY        assy;                                       // Branch to Word Assemblies and Disassemblies
    ASSY_GRP    assy_grp;                                   // Branch to group of Word Assemblies and Disassemblies
    bool        init(char *file_name, unsigned number_of_sites, bool QC_flag, bool Do_trim);         // loads *.treg file (kept for compatibility)
    bool        init(const char *file_name, unsigned number_of_sites, bool QC_flag, bool Do_trim);   // loads *.treg file
    unsigned    find(const char *label);

    void        set_trim_allowed(bool turn_on, int site = MS_ALL); // activates and disables trimming. If disabled value from "programmed" is copied into working
    void        force_table_char_active(bool activate);     // forces table char to be always on. (for charaterization)
    void        set_table_char_active(bool activate);       // enable and disable table char
    void        force_post_measurement(bool activate);      // forces post trim measurement to be always executed.
    void        sot();                                      // copies ALL start values into working
    void        eot();                                      // processes Data for adaptive trim learning
    static int  simulator() {return using_simulator;};      // running on simulator?
    static int  eng_mode()  {return engineering_mode;};     // running in Engineering Mode? (Eagle only)
    static int  num_sites() {return sites;};                // returns the number of sites
    void        register_dlog_func(void (*func)(unsigned tnum, double value, int site)); // registers a datalog function for execute() methods
    void        register_error_func(void (*func)(const char *)); // registers an function for processing error messages

private:
    TREG_ERROR  err;
    TREG_LOG    dlog;

    static int  using_simulator;     // flag showing if we are on a simulator
    static int  engineering_mode;    // flag showing if we are in engineering mode
    static int  sites;               // number of sites

    int         treg_site;
};

#endif // !defined(__TREG)
